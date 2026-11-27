import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildDigest } from '../../src/utils/digestBuilder.js';
import { formatDigestEmail } from '../../src/utils/digestEmail.js';
import { addDaysToISTDate, getISTParts } from '../../src/utils/medicinePrediction.js';

// Note: Vercel Hobby plan allows 1 cron run/day and execution timing may drift from 02:30 UTC (08:00 IST).

function getAdminFirestore(env = process.env) {
  if (getApps().length === 0) {
    const rawSa = env.FIREBASE_SERVICE_ACCOUNT;
    if (rawSa) {
      const parsed = JSON.parse(rawSa);
      initializeApp({ credential: cert(parsed) });
    } else if (env.FIREBASE_PROJECT_ID && env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) {
      initializeApp({
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      });
    } else {
      initializeApp();
    }
  }
  return getFirestore();
}

async function sendViaResend({ subject, text }, env = process.env) {
  const apiKey = env.RESEND_API_KEY;
  const to = env.CAREGIVER_EMAIL;
  const from = env.RESEND_FROM_EMAIL || 'ElderVoice AI <onboarding@resend.dev>';

  if (!apiKey || !to) {
    console.info('[daily-digest] Resend keys not configured; logged email payload:', {
      to: to || '(unset)',
      subject,
      text,
    });
    return { simulated: true };
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => response.statusText);
    throw new Error(`Resend API error (${response.status}): ${errText}`);
  }

  const data = await response.json().catch(() => ({}));
  return { simulated: false, id: data.id || null };
}

async function readCollectionDocs(db, collectionName) {
  const snap = await db.collection(collectionName).get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function runDailyDigest(deps = {}) {
  const env = deps.env || process.env;
  const now = deps.now ? new Date(deps.now) : new Date();
  const todayIST = getISTParts(now).dateStr;
  const yesterdayIST = addDaysToISTDate(todayIST, -1);

  const db = deps.db || getAdminFirestore(env);
  const sendEmail = deps.sendEmail || ((payload) => sendViaResend(payload, env));

  const digestRef = db.collection('digests').doc(yesterdayIST);
  const existingSnap = await digestRef.get();

  if (existingSnap.exists && existingSnap.data()?.status === 'sent') {
    return {
      ok: true,
      skipped: true,
      date: yesterdayIST,
      status: 'sent',
    };
  }

  let digest = null;

  try {
    const [profileSnap, medications, dose_logs, sos_events, activity_events] = await Promise.all([
      db.collection('profiles').doc('primary').get(),
      readCollectionDocs(db, 'medications'),
      readCollectionDocs(db, 'dose_logs'),
      readCollectionDocs(db, 'sos_events'),
      readCollectionDocs(db, 'activity_events'),
    ]);

    const profile = profileSnap.exists ? profileSnap.data() : null;
    digest = buildDigest(
      {
        profile,
        medications,
        dose_logs,
        sos_events,
        activity_events,
      },
      todayIST
    );

    const emailPayload = formatDigestEmail(digest);
    const sendResult = await sendEmail(emailPayload);

    const record = {
      digest,
      sent_at: new Date().toISOString(),
      channel: 'email',
      status: 'sent',
      ...(sendResult?.simulated ? { simulated: true } : {}),
    };

    await digestRef.set(record);

    return {
      ok: true,
      skipped: false,
      date: yesterdayIST,
      status: 'sent',
      simulated: Boolean(sendResult?.simulated),
      digest,
      email: emailPayload,
    };
  } catch (err) {
    console.error('[daily-digest] Digest generation/delivery failed:', err);

    try {
      await digestRef.set({
        digest,
        sent_at: null,
        channel: 'email',
        status: 'failed',
        error: err?.message || String(err),
      });
    } catch (storeErr) {
      console.error('[daily-digest] Failed to persist failed status:', storeErr);
    }

    return {
      ok: false,
      date: yesterdayIST,
      status: 'failed',
      error: err?.message || String(err),
    };
  }
}

export default async function handler(req, res, deps = {}) {
  const env = deps.env || process.env;
  const secret = env.CRON_SECRET;
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization || '';

  if (!secret || authHeader !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const result = await runDailyDigest(deps);
  if (!result.ok) {
    return res.status(500).json(result);
  }
  return res.status(200).json(result);
}
