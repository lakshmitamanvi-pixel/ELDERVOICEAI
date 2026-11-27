import {
  collection,
  documentId,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
} from 'firebase/firestore';
import { db } from './firebase.js';
import { buildDigest } from '../utils/digestBuilder.js';
import { getISTParts } from '../utils/medicinePrediction.js';

/**
 * Subscribe to the latest 7 stored digests in Firestore `digests/{YYYY-MM-DD}`.
 */
export function subscribeToDigests(onUpdate, onError) {
  let unsubscribe = () => {};

  if (!db) {
    onUpdate([]);
    return unsubscribe;
  }

  try {
    const q = query(collection(db, 'digests'), orderBy(documentId(), 'desc'), limit(7));
    unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        onUpdate(list);
      },
      (error) => {
        console.warn('[digestService] Digests subscription error:', error.message);
        onUpdate([]);
        if (onError) onError(error);
      }
    );
  } catch (error) {
    console.warn('[digestService] Digests init failed:', error);
    onUpdate([]);
  }

  return () => unsubscribe();
}

async function safeReadCollection(name) {
  if (!db) return [];
  try {
    const snap = await getDocs(collection(db, name));
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.warn(`[digestService] Could not read ${name} for preview:`, err.message);
    return [];
  }
}

/**
 * Dry-run preview of yesterday's digest (reads logs, never sends email or writes to Firestore).
 */
export async function previewYesterdayDigest({ profile = null, medications = [] } = {}) {
  const [dose_logs, sos_events, activity_events] = await Promise.all([
    safeReadCollection('dose_logs'),
    safeReadCollection('sos_events'),
    safeReadCollection('activity_events'),
  ]);

  const todayIST = getISTParts(new Date()).dateStr;
  return buildDigest(
    {
      profile,
      medications,
      dose_logs,
      sos_events,
      activity_events,
    },
    todayIST
  );
}
