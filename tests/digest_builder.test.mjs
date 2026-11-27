import assert from 'node:assert/strict';
import { buildDigest } from '../src/utils/digestBuilder.js';

const DATE_IST = '2026-11-27';

// T1: 4 scheduled, 3 taken -> 1 missed w/ correct name+time, adherence 75
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      medications: [
        { id: 'm1', name: 'Lisinopril', schedule_type: 'daily', times_of_day: ['08:00'], stock_count: 20, active: true },
        { id: 'm2', name: 'Metformin', schedule_type: 'daily', times_of_day: ['13:00', '20:00'], stock_count: 20, active: true },
        { id: 'm3', name: 'Atorvastatin', schedule_type: 'daily', times_of_day: ['21:00'], stock_count: 20, active: true },
      ],
      dose_logs: [
        { medicine_id: 'm1', medicine_name: 'Lisinopril', scheduled_at: '2026-11-26T02:30:00.000Z', logged_at: '2026-11-26T02:35:00.000Z', status: 'taken', source: 'button' },
        { medicine_id: 'm2', medicine_name: 'Metformin', scheduled_at: '2026-11-26T07:30:00.000Z', logged_at: '2026-11-26T07:32:00.000Z', status: 'taken', source: 'button' },
        { medicine_id: 'm3', medicine_name: 'Atorvastatin', scheduled_at: '2026-11-26T15:30:00.000Z', logged_at: '2026-11-26T15:40:00.000Z', status: 'taken', source: 'voice' },
      ],
    },
    DATE_IST
  );

  assert.equal(digest.date, '2026-11-26');
  assert.equal(digest.meds.scheduled_count, 4);
  assert.equal(digest.meds.taken_count, 3);
  assert.equal(digest.meds.adherence_pct, 75);
  assert.deepEqual(digest.meds.missed, [{ name: 'Metformin', time: '20:00' }]);
  assert.ok(digest.flags.includes('Missed 1 dose'));
}

// T2: 0 scheduled -> adherence null, no missed flag
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      medications: [],
      dose_logs: [],
    },
    DATE_IST
  );

  assert.equal(digest.meds.scheduled_count, 0);
  assert.equal(digest.meds.taken_count, 0);
  assert.equal(digest.meds.adherence_pct, null);
  assert.deepEqual(digest.meds.missed, []);
  assert.equal(digest.flags.some((f) => f.startsWith('Missed')), false);
}

// T3: log at 2026-11-26 23:50 IST counts; 2026-11-27 00:10 IST doesn't
// 2026-11-26 23:50 IST = 2026-11-26T18:20:00.000Z
// 2026-11-27 00:10 IST = 2026-11-26T18:40:00.000Z
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      medications: [
        { id: 'm1', name: 'MedA', schedule_type: 'daily', times_of_day: ['08:00', '20:00'], stock_count: 20, active: true },
      ],
      dose_logs: [
        { medicine_id: 'm1', medicine_name: 'MedA', scheduled_at: '2026-11-26T02:30:00.000Z', logged_at: '2026-11-26T18:20:00.000Z', status: 'taken', source: 'button' },
        { medicine_id: 'm1', medicine_name: 'MedA', scheduled_at: '2026-11-26T14:30:00.000Z', logged_at: '2026-11-26T18:40:00.000Z', status: 'taken', source: 'button' },
      ],
    },
    DATE_IST
  );

  assert.equal(digest.meds.scheduled_count, 2);
  assert.equal(digest.meds.taken_count, 1);
  assert.equal(digest.meds.adherence_pct, 50);
  assert.deepEqual(digest.meds.missed, [{ name: 'MedA', time: '20:00' }]);
}

// T4: log at 2026-11-26T19:00:00Z (= 2026-11-27 00:30 IST) must NOT count
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      medications: [
        { id: 'm1', name: 'MedA', schedule_type: 'daily', times_of_day: ['08:00'], stock_count: 20, active: true },
      ],
      dose_logs: [
        { medicine_id: 'm1', medicine_name: 'MedA', scheduled_at: '2026-11-26T02:30:00.000Z', logged_at: '2026-11-26T19:00:00.000Z', status: 'taken', source: 'button' },
      ],
    },
    DATE_IST
  );

  assert.equal(digest.meds.scheduled_count, 1);
  assert.equal(digest.meds.taken_count, 0);
  assert.equal(digest.meds.adherence_pct, 0);
}

// T5: as_needed ignored
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      medications: [
        { id: 'm-prn', name: 'Paracetamol', schedule_type: 'as_needed', times_of_day: [], stock_count: 10, active: true },
      ],
      dose_logs: [
        { medicine_id: 'm-prn', medicine_name: 'Paracetamol', scheduled_at: '2026-11-26T05:00:00.000Z', logged_at: '2026-11-26T05:00:00.000Z', status: 'taken', source: 'button' },
      ],
    },
    DATE_IST
  );

  assert.equal(digest.meds.scheduled_count, 0);
  assert.equal(digest.meds.taken_count, 0);
  assert.equal(digest.meds.adherence_pct, null);
  assert.deepEqual(digest.meds.missed, []);
}

// T6: unresolved SOS -> flag "SOS triggered"
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      sos_events: [
        { triggered_at: '2026-11-26T10:00:00.000Z', resolved_at: null, source: 'button' },
      ],
    },
    DATE_IST
  );

  assert.deepEqual(digest.sos, [{ time: '15:30', resolved: false }]);
  assert.ok(digest.flags.includes('SOS triggered'));
}

// T7: no activity events -> activity omitted (and no "No activity yesterday" flag if never active)
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      activity_events: [],
    },
    DATE_IST
  );

  assert.equal('activity' in digest, false);
  assert.equal(digest.flags.includes('No activity yesterday'), false);

  // Bonus check: if previously active, "No activity yesterday" flag IS added while activity remains omitted
  const digestPrior = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      activity_events: [{ at: '2026-11-25T10:00:00.000Z', type: 'app_open' }],
    },
    DATE_IST
  );
  assert.equal('activity' in digestPrior, false);
  assert.ok(digestPrior.flags.includes('No activity yesterday'));
}

// T8: a "skipped" log -> counted as missed
{
  const digest = buildDigest(
    {
      senior_name: 'Eleanor Vance',
      medications: [
        { id: 'm1', name: 'Lisinopril', schedule_type: 'daily', times_of_day: ['08:00'], stock_count: 20, active: true },
      ],
      dose_logs: [
        { medicine_id: 'm1', medicine_name: 'Lisinopril', scheduled_at: '2026-11-26T02:30:00.000Z', logged_at: '2026-11-26T02:45:00.000Z', status: 'skipped', source: 'button' },
      ],
    },
    DATE_IST
  );

  assert.equal(digest.meds.scheduled_count, 1);
  assert.equal(digest.meds.taken_count, 0);
  assert.equal(digest.meds.adherence_pct, 0);
  assert.deepEqual(digest.meds.missed, [{ name: 'Lisinopril', time: '08:00' }]);
  assert.ok(digest.flags.includes('Missed 1 dose'));
}

console.log('ALL_DIGEST_TESTS_PASSED');
