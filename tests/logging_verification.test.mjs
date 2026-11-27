import assert from 'node:assert/strict';
import {
  logDoseEvent,
  logSosTriggered,
  resolveSosEvent,
  logActivityEvent,
  flushPendingLogs,
  computeScheduledAtUTC,
  PENDING_LOGS_STORAGE_KEY,
} from '../src/services/loggingService.js';

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(k) {
      return map.has(k) ? map.get(k) : null;
    },
    setItem(k, v) {
      map.set(k, String(v));
    },
  };
}

function createMemoryFirestoreAdapter({ failWrites = false } = {}) {
  const collections = {
    dose_logs: new Map(),
    sos_events: new Map(),
    activity_events: new Map(),
  };
  let seq = 1;
  let shouldFail = failWrites;

  return {
    collections,
    setFailWrites(val) {
      shouldFail = val;
    },
    async createWithId(collectionName, docId, data) {
      if (shouldFail) throw new Error('Simulated Firestore offline error');
      collections[collectionName].set(docId, { id: docId, ...data });
      return docId;
    },
    async createAuto(collectionName, data) {
      if (shouldFail) throw new Error('Simulated Firestore offline error');
      const id = `${collectionName}-${seq++}`;
      collections[collectionName].set(id, { id, ...data });
      return id;
    },
    async updateFields(collectionName, docId, data) {
      if (shouldFail) throw new Error('Simulated Firestore offline error');
      const existing = collections[collectionName].get(docId);
      if (!existing) throw new Error(`Doc not found: ${collectionName}/${docId}`);
      collections[collectionName].set(docId, { ...existing, ...data });
    },
    async findTakenDose(medicineId, scheduledAt) {
      for (const doc of collections.dose_logs.values()) {
        if (
          doc.medicine_id === medicineId &&
          doc.scheduled_at === scheduledAt &&
          doc.status === 'taken'
        ) {
          return true;
        }
      }
      return false;
    },
  };
}

const isoUtcRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// 1. Write sample dose_log and read back with UTC ISO timestamps + dedup
{
  const adapter = createMemoryFirestoreAdapter();
  const storage = createMemoryStorage();
  const med = {
    id: 'med-1',
    name: 'Lisinopril',
    schedule_type: 'daily',
    times_of_day: ['08:00'],
  };
  // 2026-11-27 08:15 IST = 2026-11-27T02:45:00.000Z
  const now = new Date('2026-11-27T02:45:00.000Z');
  const expectedScheduled = computeScheduledAtUTC(med, now);
  assert.equal(expectedScheduled, '2026-11-27T02:30:00.000Z'); // 08:00 IST in UTC

  const first = await logDoseEvent(
    { med, status: 'taken', source: 'button', loggedAt: now },
    { adapter, storage }
  );
  assert.equal(first.success, true);
  assert.equal(adapter.collections.dose_logs.size, 1);

  const [savedDose] = [...adapter.collections.dose_logs.values()];
  assert.equal(savedDose.medicine_id, 'med-1');
  assert.equal(savedDose.medicine_name, 'Lisinopril');
  assert.equal(savedDose.status, 'taken');
  assert.equal(savedDose.source, 'button');
  assert.match(savedDose.scheduled_at, isoUtcRegex);
  assert.match(savedDose.logged_at, isoUtcRegex);

  // Duplicate "taken" for same medicine_id + scheduled_at must be deduplicated
  const second = await logDoseEvent(
    { med, status: 'taken', source: 'caregiver', loggedAt: now },
    { adapter, storage }
  );
  assert.equal(second.success, true);
  assert.equal(second.deduplicated, true);
  assert.equal(adapter.collections.dose_logs.size, 1);
}

// 2. Write sample sos_event, read back, and resolve with resolved_at UTC timestamp
{
  const adapter = createMemoryFirestoreAdapter();
  const storage = createMemoryStorage();

  const triggered = await logSosTriggered(
    { source: 'button', triggeredAt: '2026-11-27T10:00:00.000Z' },
    { adapter, storage }
  );
  assert.equal(triggered.success, true);
  assert.equal(adapter.collections.sos_events.size, 1);

  const savedBefore = adapter.collections.sos_events.get(triggered.id);
  assert.equal(savedBefore.triggered_at, '2026-11-27T10:00:00.000Z');
  assert.equal(savedBefore.resolved_at, null);
  assert.equal(savedBefore.source, 'button');

  const resolved = await resolveSosEvent(
    triggered.id,
    { resolvedAt: '2026-11-27T10:05:00.000Z' },
    { adapter, storage }
  );
  assert.equal(resolved.success, true);

  const savedAfter = adapter.collections.sos_events.get(triggered.id);
  assert.equal(savedAfter.resolved_at, '2026-11-27T10:05:00.000Z');
}

// 3. Write activity_events with 1/min throttle and no message content
{
  const adapter = createMemoryFirestoreAdapter();
  const storage = createMemoryStorage();
  const throttleMap = new Map();

  const a1 = await logActivityEvent(
    'voice_query',
    { at: '2026-11-27T12:00:00.000Z' },
    { adapter, storage, throttleMap }
  );
  assert.equal(a1.success, true);
  assert.equal(a1.throttled, undefined);

  // Within 60s -> throttled
  const a2 = await logActivityEvent(
    'voice_query',
    { at: '2026-11-27T12:00:30.000Z' },
    { adapter, storage, throttleMap }
  );
  assert.equal(a2.throttled, true);
  assert.equal(adapter.collections.activity_events.size, 1);

  // After 60s -> allowed
  const a3 = await logActivityEvent(
    'voice_query',
    { at: '2026-11-27T12:01:05.000Z' },
    { adapter, storage, throttleMap }
  );
  assert.equal(a3.success, true);
  assert.equal(adapter.collections.activity_events.size, 2);

  for (const doc of adapter.collections.activity_events.values()) {
    assert.deepEqual(Object.keys(doc).sort(), ['at', 'id', 'type']);
    assert.match(doc.at, isoUtcRegex);
  }
}

// 4. Firestore write failure queues in localStorage and flushes on next app open
{
  const adapter = createMemoryFirestoreAdapter({ failWrites: true });
  const storage = createMemoryStorage();
  const throttleMap = new Map();

  const res = await logActivityEvent(
    'app_open',
    { at: '2026-11-27T15:00:00.000Z' },
    { adapter, storage, throttleMap }
  );
  assert.equal(res.success, false);
  assert.equal(res.queued, true);
  assert.equal(adapter.collections.activity_events.size, 0);

  const queuedRaw = JSON.parse(storage.getItem(PENDING_LOGS_STORAGE_KEY));
  assert.equal(queuedRaw.length, 1);

  // Next app open: Firestore is back online
  adapter.setFailWrites(false);
  const flushed = await flushPendingLogs({ adapter, storage });
  assert.equal(flushed.flushed, 1);
  assert.equal(flushed.remaining, 0);
  assert.equal(adapter.collections.activity_events.size, 1);
}

console.log('ALL_LOGGING_TESTS_PASSED');
