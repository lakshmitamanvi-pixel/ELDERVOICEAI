import assert from 'node:assert/strict';
import handler from '../api/cron/daily-digest.js';
import { formatDigestEmail } from '../src/utils/digestEmail.js';

function createMockAdminDb(seed = {}) {
  const store = new Map();
  for (const [colName, docsObj] of Object.entries(seed)) {
    const colMap = new Map();
    for (const [id, data] of Object.entries(docsObj)) {
      colMap.set(id, { ...data });
    }
    store.set(colName, colMap);
  }

  const getCol = (name) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name);
  };

  return {
    store,
    collection(name) {
      return {
        async get() {
          const col = getCol(name);
          const docs = [...col.entries()].map(([id, data]) => ({
            id,
            exists: true,
            data: () => ({ ...data }),
          }));
          return { docs };
        },
        doc(id) {
          return {
            async get() {
              const col = getCol(name);
              if (!col.has(id)) {
                return { id, exists: false, data: () => undefined };
              }
              return { id, exists: true, data: () => ({ ...col.get(id) }) };
            },
            async set(data) {
              const col = getCol(name);
              col.set(id, { ...data });
            },
          };
        },
      };
    },
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

const TEST_NOW = '2026-11-27T02:30:00.000Z'; // 08:00 IST on 2026-11-27 -> digests 2026-11-26
const TEST_ENV = { CRON_SECRET: 'test-cron-secret' };

// 1. No secret or wrong secret -> 401
{
  const db = createMockAdminDb();
  const resNoHeader = createMockRes();
  await handler({ headers: {} }, resNoHeader, { db, env: TEST_ENV, now: TEST_NOW });
  assert.equal(resNoHeader.statusCode, 401);

  const resWrong = createMockRes();
  await handler(
    { headers: { authorization: 'Bearer wrong-secret' } },
    resWrong,
    { db, env: TEST_ENV, now: TEST_NOW }
  );
  assert.equal(resWrong.statusCode, 401);
}

// 2. Seed fake logs -> 1st run creates 1 digest doc + 1 email; 2nd run is idempotent (0 new)
{
  const db = createMockAdminDb({
    profiles: {
      primary: { fullName: 'Eleanor Vance', preferredName: 'Eleanor Vance' },
    },
    medications: {
      m1: { name: 'Lisinopril', schedule_type: 'daily', times_of_day: ['08:00'], stock_count: 20, active: true },
      m2: { name: 'Metformin', schedule_type: 'daily', times_of_day: ['13:00', '20:00'], stock_count: 2, lead_days: 3, active: true },
    },
    dose_logs: {
      d1: {
        medicine_id: 'm1',
        medicine_name: 'Lisinopril',
        scheduled_at: '2026-11-26T02:30:00.000Z',
        logged_at: '2026-11-26T02:35:00.000Z',
        status: 'taken',
        source: 'button',
      },
      d2: {
        medicine_id: 'm2',
        medicine_name: 'Metformin',
        scheduled_at: '2026-11-26T07:30:00.000Z',
        logged_at: '2026-11-26T07:35:00.000Z',
        status: 'taken',
        source: 'button',
      },
    },
    sos_events: {
      s1: { triggered_at: '2026-11-26T10:00:00.000Z', resolved_at: null, source: 'button' },
    },
    activity_events: {
      a1: { at: '2026-11-26T03:00:00.000Z', type: 'app_open' },
      a2: { at: '2026-11-26T11:00:00.000Z', type: 'voice_query' },
    },
  });

  const sentEmails = [];
  const sendEmail = async (payload) => {
    sentEmails.push(payload);
    return { simulated: false, id: 'email-1' };
  };

  const req = { headers: { authorization: 'Bearer test-cron-secret' } };
  const res1 = createMockRes();
  await handler(req, res1, { db, sendEmail, env: TEST_ENV, now: TEST_NOW });

  assert.equal(res1.statusCode, 200);
  assert.equal(res1.body.skipped, false);
  assert.equal(res1.body.status, 'sent');
  assert.equal(db.store.get('digests').size, 1);
  assert.equal(sentEmails.length, 1);

  const savedDoc = db.store.get('digests').get('2026-11-26');
  assert.equal(savedDoc.status, 'sent');
  assert.equal(savedDoc.channel, 'email');
  assert.ok(savedDoc.sent_at);

  const email = sentEmails[0];
  assert.equal(email.subject, 'Daily update: Eleanor Vance, 2026-11-26');
  const lines = email.text.split('\n');
  assert.ok(lines.length <= 10, `Expected <= 10 lines, got ${lines.length}`);
  assert.ok(lines[0].startsWith('Flags:'));
  assert.ok(email.text.includes('Metformin (20:00)'));

  // 2nd run -> idempotent, 0 new docs, 0 new emails
  const res2 = createMockRes();
  await handler(req, res2, { db, sendEmail, env: TEST_ENV, now: TEST_NOW });
  assert.equal(res2.statusCode, 200);
  assert.equal(res2.body.skipped, true);
  assert.equal(db.store.get('digests').size, 1);
  assert.equal(sentEmails.length, 1);
}

// 3. Failure -> status="failed", no crash; retry next run -> status="sent"
{
  const db = createMockAdminDb({
    profiles: { primary: { fullName: 'Eleanor Vance' } },
  });
  let shouldFail = true;
  const sendEmail = async () => {
    if (shouldFail) throw new Error('Simulated Resend outage');
    return { simulated: false, id: 'email-retry' };
  };

  const req = { headers: { authorization: 'Bearer test-cron-secret' } };
  const resFail = createMockRes();
  await handler(req, resFail, { db, sendEmail, env: TEST_ENV, now: TEST_NOW });

  assert.equal(resFail.statusCode, 500);
  assert.equal(resFail.body.status, 'failed');
  assert.equal(db.store.get('digests').get('2026-11-26').status, 'failed');

  shouldFail = false;
  const resRetry = createMockRes();
  await handler(req, resRetry, { db, sendEmail, env: TEST_ENV, now: TEST_NOW });
  assert.equal(resRetry.statusCode, 200);
  assert.equal(resRetry.body.status, 'sent');
  assert.equal(db.store.get('digests').get('2026-11-26').status, 'sent');
}

// 4. Empty day -> no crash, adherence null (no fake 100%), "All doses taken. No alerts."
{
  const db = createMockAdminDb();
  const sentEmails = [];
  const sendEmail = async (payload) => {
    sentEmails.push(payload);
    return { simulated: true };
  };

  const req = { headers: { authorization: 'Bearer test-cron-secret' } };
  const res = createMockRes();
  await handler(req, res, { db, sendEmail, env: TEST_ENV, now: TEST_NOW });

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.digest.meds.adherence_pct, null);
  assert.equal(sentEmails.length, 1);
  assert.ok(sentEmails[0].text.includes('All doses taken. No alerts.'));

  // Also check formatDigestEmail directly for <= 10 lines
  const formatted = formatDigestEmail(res.body.digest);
  assert.ok(formatted.text.split('\n').length <= 10);
}

console.log('ALL_CRON_DIGEST_TESTS_PASSED');
