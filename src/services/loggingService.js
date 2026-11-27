import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  getDocs,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { getISTParts, istDateTimeToUTC, normalizeMedicine } from '../utils/medicinePrediction.js';

export const PENDING_LOGS_STORAGE_KEY = 'eldervoice_pending_logs_queue';
export const DOSE_DEDUP_STORAGE_KEY = 'eldervoice_dose_dedup_keys';
export const ACTIVITY_THROTTLE_MS = 60 * 1000;

const lastActivityByType = new Map();

function getStorage(storageOverride) {
  if (storageOverride) return storageOverride;
  if (typeof localStorage !== 'undefined') return localStorage;
  return null;
}

function readJsonArray(storage, key) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeJsonArray(storage, key, arr) {
  if (!storage) return;
  try {
    storage.setItem(key, JSON.stringify(arr));
  } catch {
    // Ignore storage quota errors so user flow never breaks
  }
}

function sanitizeDocId(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, '_');
}

export function buildDoseDedupKey(medicineId, scheduledAt) {
  return `taken__${sanitizeDocId(medicineId)}__${sanitizeDocId(scheduledAt)}`;
}

/**
 * Compute the scheduled_at UTC ISO timestamp for a medication dose at `now`.
 */
export function computeScheduledAtUTC(med, nowInput = new Date()) {
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const normalized = normalizeMedicine(med);

  if (normalized.schedule_type === 'as_needed' || normalized.times_of_day.length === 0) {
    return now.toISOString();
  }

  const nowIST = getISTParts(now);
  const sortedTimes = [...normalized.times_of_day].sort();

  // Pick the latest scheduled slot today that is <= current IST time, or earliest slot today.
  let chosenTime = sortedTimes[0];
  for (const t of sortedTimes) {
    if (t <= nowIST.timeStr) {
      chosenTime = t;
    }
  }

  return istDateTimeToUTC(nowIST.dateStr, chosenTime).toISOString();
}

function defaultFirestoreAdapter() {
  return {
    async createWithId(collectionName, docId, data) {
      const ref = doc(db, collectionName, docId);
      await setDoc(ref, data);
      return docId;
    },
    async createAuto(collectionName, data) {
      const colRef = collection(db, collectionName);
      const docRef = await addDoc(colRef, data);
      return docRef.id;
    },
    async updateFields(collectionName, docId, data) {
      const ref = doc(db, collectionName, docId);
      await updateDoc(ref, data);
    },
    async findTakenDose(medicineId, scheduledAt) {
      const colRef = collection(db, 'dose_logs');
      const q = query(
        colRef,
        where('medicine_id', '==', medicineId),
        where('scheduled_at', '==', scheduledAt),
        where('status', '==', 'taken')
      );
      const snap = await getDocs(q);
      return !snap.empty;
    },
  };
}

function enqueuePendingOp(storage, op) {
  const queue = readJsonArray(storage, PENDING_LOGS_STORAGE_KEY);
  queue.push(op);
  writeJsonArray(storage, PENDING_LOGS_STORAGE_KEY, queue);
}

/**
 * Log a medication dose event ("taken" | "skipped") to Firestore `dose_logs`.
 * Deduplicates "taken" logs on (medicine_id, scheduled_at).
 */
export async function logDoseEvent(
  {
    med,
    medicineId,
    medicineName,
    scheduledAt,
    loggedAt,
    status = 'taken',
    source = 'button',
  } = {},
  deps = {}
) {
  const adapter = deps.adapter || defaultFirestoreAdapter();
  const storage = getStorage(deps.storage);
  const now = loggedAt ? new Date(loggedAt) : new Date();
  const loggedAtIso = now.toISOString();

  const resolvedMedId = medicineId || med?.id || 'unknown';
  const resolvedMedName = medicineName || med?.name || 'Unknown Medication';
  const resolvedScheduledAt = scheduledAt || (med ? computeScheduledAtUTC(med, now) : loggedAtIso);

  const payload = {
    medicine_id: resolvedMedId,
    medicine_name: resolvedMedName,
    scheduled_at: resolvedScheduledAt,
    logged_at: loggedAtIso,
    status,
    source,
  };

  const dedupKey = status === 'taken' ? buildDoseDedupKey(resolvedMedId, resolvedScheduledAt) : null;

  if (dedupKey) {
    const localKeys = readJsonArray(storage, DOSE_DEDUP_STORAGE_KEY);
    if (localKeys.includes(dedupKey)) {
      return { success: true, deduplicated: true, payload };
    }
  }

  try {
    if (dedupKey) {
      if (adapter.findTakenDose) {
        const exists = await adapter.findTakenDose(resolvedMedId, resolvedScheduledAt);
        if (exists) {
          const localKeys = readJsonArray(storage, DOSE_DEDUP_STORAGE_KEY);
          if (!localKeys.includes(dedupKey)) {
            writeJsonArray(storage, DOSE_DEDUP_STORAGE_KEY, [...localKeys, dedupKey]);
          }
          return { success: true, deduplicated: true, payload };
        }
      }
      const id = await adapter.createWithId('dose_logs', dedupKey, payload);
      const localKeys = readJsonArray(storage, DOSE_DEDUP_STORAGE_KEY);
      if (!localKeys.includes(dedupKey)) {
        writeJsonArray(storage, DOSE_DEDUP_STORAGE_KEY, [...localKeys, dedupKey]);
      }
      return { success: true, id, payload };
    }

    const id = await adapter.createAuto('dose_logs', payload);
    return { success: true, id, payload };
  } catch (err) {
    console.error('[loggingService] Failed to write dose_log, queueing for retry:', err);
    enqueuePendingOp(storage, {
      op: dedupKey ? 'createWithId' : 'createAuto',
      collection: 'dose_logs',
      docId: dedupKey || undefined,
      payload,
    });
    return { success: false, queued: true, payload, error: err };
  }
}

/**
 * Log an SOS trigger event to Firestore `sos_events`.
 */
export async function logSosTriggered({ source = 'button', triggeredAt } = {}, deps = {}) {
  const adapter = deps.adapter || defaultFirestoreAdapter();
  const storage = getStorage(deps.storage);
  const triggeredAtIso = (triggeredAt ? new Date(triggeredAt) : new Date()).toISOString();

  const payload = {
    triggered_at: triggeredAtIso,
    resolved_at: null,
    source,
  };

  try {
    const id = await adapter.createAuto('sos_events', payload);
    return { success: true, id, payload };
  } catch (err) {
    console.error('[loggingService] Failed to write sos_event, queueing for retry:', err);
    enqueuePendingOp(storage, {
      op: 'createAuto',
      collection: 'sos_events',
      payload,
    });
    return { success: false, queued: true, payload, error: err };
  }
}

/**
 * Mark an existing SOS event as resolved by setting `resolved_at`.
 */
export async function resolveSosEvent(eventId, { resolvedAt } = {}, deps = {}) {
  if (!eventId) {
    return { success: false, error: new Error('eventId is required') };
  }

  const adapter = deps.adapter || defaultFirestoreAdapter();
  const storage = getStorage(deps.storage);
  const resolvedAtIso = (resolvedAt ? new Date(resolvedAt) : new Date()).toISOString();
  const updates = { resolved_at: resolvedAtIso };

  try {
    await adapter.updateFields('sos_events', eventId, updates);
    return { success: true, id: eventId, updates };
  } catch (err) {
    console.error('[loggingService] Failed to resolve sos_event, queueing for retry:', err);
    enqueuePendingOp(storage, {
      op: 'updateFields',
      collection: 'sos_events',
      docId: eventId,
      payload: updates,
    });
    return { success: false, queued: true, id: eventId, updates, error: err };
  }
}

/**
 * Log a privacy-safe activity event ("voice_query" | "chat" | "app_open") to `activity_events`.
 * Throttled to at most 1 event per minute per type.
 */
export async function logActivityEvent(type, { at } = {}, deps = {}) {
  const allowedTypes = ['voice_query', 'chat', 'app_open'];
  if (!allowedTypes.includes(type)) {
    return { success: false, error: new Error(`Invalid activity type: ${type}`) };
  }

  const nowMs = at ? new Date(at).getTime() : Date.now();
  const throttleMap = deps.throttleMap || lastActivityByType;
  const lastMs = throttleMap.get(type);

  if (typeof lastMs === 'number' && nowMs - lastMs < ACTIVITY_THROTTLE_MS) {
    return { success: true, throttled: true };
  }

  throttleMap.set(type, nowMs);

  const adapter = deps.adapter || defaultFirestoreAdapter();
  const storage = getStorage(deps.storage);
  const payload = {
    at: new Date(nowMs).toISOString(),
    type,
  };

  try {
    const id = await adapter.createAuto('activity_events', payload);
    return { success: true, id, payload };
  } catch (err) {
    console.error('[loggingService] Failed to write activity_event, queueing for retry:', err);
    enqueuePendingOp(storage, {
      op: 'createAuto',
      collection: 'activity_events',
      payload,
    });
    return { success: false, queued: true, payload, error: err };
  }
}

/**
 * Flush queued log writes from localStorage on app open.
 */
export async function flushPendingLogs(deps = {}) {
  const adapter = deps.adapter || defaultFirestoreAdapter();
  const storage = getStorage(deps.storage);
  const queue = readJsonArray(storage, PENDING_LOGS_STORAGE_KEY);
  if (queue.length === 0) {
    return { flushed: 0, remaining: 0 };
  }

  const remaining = [];
  let flushed = 0;

  for (const item of queue) {
    try {
      if (item.op === 'createWithId' && item.docId) {
        await adapter.createWithId(item.collection, item.docId, item.payload);
        if (item.collection === 'dose_logs') {
          const localKeys = readJsonArray(storage, DOSE_DEDUP_STORAGE_KEY);
          if (!localKeys.includes(item.docId)) {
            writeJsonArray(storage, DOSE_DEDUP_STORAGE_KEY, [...localKeys, item.docId]);
          }
        }
      } else if (item.op === 'updateFields' && item.docId) {
        await adapter.updateFields(item.collection, item.docId, item.payload);
      } else {
        await adapter.createAuto(item.collection, item.payload);
      }
      flushed += 1;
    } catch (err) {
      console.error('[loggingService] Retry failed for queued log:', err);
      remaining.push(item);
    }
  }

  writeJsonArray(storage, PENDING_LOGS_STORAGE_KEY, remaining);
  return { flushed, remaining: remaining.length };
}
