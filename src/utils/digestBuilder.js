import {
  addDaysToISTDate,
  diffISTDays,
  getISTParts,
  getWeekdayOfISTDate,
  istDateTimeToUTC,
  normalizeMedicine,
  predictMedicineRunOut,
} from './medicinePrediction.js';

function isMedScheduledOnDate(med, istDateStr) {
  if (!med.active || med.schedule_type === 'as_needed') {
    return false;
  }
  if (med.course_end_date && istDateStr > med.course_end_date) {
    return false;
  }
  if (med.schedule_type === 'daily') {
    return true;
  }
  if (med.schedule_type === 'weekdays') {
    const wd = getWeekdayOfISTDate(istDateStr);
    return Array.isArray(med.weekdays) && med.weekdays.includes(wd);
  }
  if (med.schedule_type === 'every_n_days') {
    const interval = Math.max(1, Number(med.interval_days) || 1);
    const anchorIST = getISTParts(med.stock_updated_at || med.createdAt || new Date()).dateStr;
    const delta = diffISTDays(anchorIST, istDateStr);
    return delta >= 0 && delta % interval === 0;
  }
  return false;
}

function toMs(isoOrDate) {
  if (!isoOrDate) return NaN;
  const ms = new Date(isoOrDate).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function mapStockStatus(prediction) {
  if (!prediction || !prediction.canPredict || !prediction.shouldAlert) {
    return null;
  }
  if (prediction.status === 'out_of_stock') {
    return 'empty';
  }
  if (prediction.alertSeverity === 'critical') {
    return 'urgent';
  }
  if (prediction.alertSeverity === 'warning') {
    return 'low';
  }
  return null;
}

/**
 * Pure function that builds the daily caregiver digest for yesterday (Asia/Kolkata)
 * from raw Firestore collections. Performs no I/O and includes no chat content or health advice.
 */
export function buildDigest(data = {}, dateIST = getISTParts(new Date()).dateStr) {
  const yesterdayIST = addDaysToISTDate(dateIST, -1);
  const windowStartMs = istDateTimeToUTC(yesterdayIST, '00:00').getTime();
  const windowEndMs = istDateTimeToUTC(dateIST, '00:00').getTime();

  const inWindow = (isoStr) => {
    const ms = toMs(isoStr);
    return Number.isFinite(ms) && ms >= windowStartMs && ms < windowEndMs;
  };

  const seniorName =
    data.senior_name ||
    data.profile?.preferredName ||
    data.profile?.fullName ||
    'Senior';

  const rawMeds = Array.isArray(data.medications) ? data.medications : [];
  const rawDoseLogs = Array.isArray(data.dose_logs) ? data.dose_logs : [];
  const rawSosEvents = Array.isArray(data.sos_events) ? data.sos_events : [];
  const rawActivityEvents = Array.isArray(data.activity_events) ? data.activity_events : [];

  // 1. Build scheduled dose slots for yesterdayIST (excluding inactive & as_needed)
  const normalizedMeds = rawMeds.map((m) => ({
    ...normalizeMedicine(m),
    id: m.id,
    createdAt: m.createdAt,
  }));

  const nonAsNeededMedIds = new Set(
    normalizedMeds.filter((m) => m.active && m.schedule_type !== 'as_needed').map((m) => m.id)
  );

  const scheduledSlots = [];
  for (const med of normalizedMeds) {
    if (!isMedScheduledOnDate(med, yesterdayIST)) {
      continue;
    }
    for (const timeStr of med.times_of_day) {
      scheduledSlots.push({
        medicine_id: med.id,
        name: med.name,
        time: timeStr,
        scheduledAtMs: istDateTimeToUTC(yesterdayIST, timeStr).getTime(),
        taken: false,
      });
    }
  }

  // 2. Match "taken" dose_logs whose logged_at falls in yesterday's IST window
  const takenLogsInWindow = rawDoseLogs.filter((log) => {
    if (!log || log.status !== 'taken') return false;
    if (!inWindow(log.logged_at)) return false;
    if (log.medicine_id && rawMeds.length > 0 && !nonAsNeededMedIds.has(log.medicine_id)) {
      return false;
    }
    return true;
  });

  for (const log of takenLogsInWindow) {
    const logScheduledMs = toMs(log.scheduled_at);

    // Prefer exact (medicine_id, scheduled_at) match
    let slot = scheduledSlots.find(
      (s) =>
        !s.taken &&
        s.medicine_id === log.medicine_id &&
        Number.isFinite(logScheduledMs) &&
        s.scheduledAtMs === logScheduledMs
    );

    // Fallback: first untaken slot for the same medicine_id
    if (!slot) {
      slot = scheduledSlots.find((s) => !s.taken && s.medicine_id === log.medicine_id);
    }

    if (slot) {
      slot.taken = true;
    }
  }

  const scheduledCount = scheduledSlots.length;
  const takenCount = scheduledSlots.filter((s) => s.taken).length;
  const missed = scheduledSlots
    .filter((s) => !s.taken)
    .map((s) => ({ name: s.name, time: s.time }));
  const adherencePct =
    scheduledCount === 0 ? null : Math.round((takenCount / scheduledCount) * 100);

  // 3. Stock alerts (low / urgent / empty only)
  const refNow = istDateTimeToUTC(dateIST, '00:00');
  const stock = [];
  for (const med of normalizedMeds) {
    const prediction = predictMedicineRunOut(med, refNow);
    const mappedStatus = mapStockStatus(prediction);
    if (!mappedStatus) continue;
    stock.push({
      name: med.name,
      status: mappedStatus,
      days_left: prediction.daysRemaining,
      run_out_date: prediction.runOutDateIST,
    });
  }

  // 4. SOS events in yesterday's window
  const sos = rawSosEvents
    .filter((ev) => ev && inWindow(ev.triggered_at))
    .sort((a, b) => toMs(a.triggered_at) - toMs(b.triggered_at))
    .map((ev) => ({
      time: getISTParts(ev.triggered_at).timeStr,
      resolved: Boolean(ev.resolved_at),
    }));

  // 5. Activity events in yesterday's window (omit activity if none)
  const windowActivity = rawActivityEvents
    .filter((ev) => ev && inWindow(ev.at))
    .sort((a, b) => toMs(a.at) - toMs(b.at));

  const hadPriorActivity = rawActivityEvents.some((ev) => {
    if (!ev) return false;
    const ms = toMs(ev.at);
    return Number.isFinite(ms) && ms < windowStartMs;
  });

  // 6. Rule-based flags
  const flags = [];
  if (missed.length >= 1) {
    flags.push(`Missed ${missed.length} dose${missed.length === 1 ? '' : 's'}`);
  }
  if (sos.length > 0) {
    flags.push('SOS triggered');
  }
  if (windowActivity.length === 0 && hadPriorActivity) {
    flags.push('No activity yesterday');
  }
  for (const item of stock) {
    flags.push(`Stock low: ${item.name}`);
  }

  const digest = {
    date: yesterdayIST,
    senior_name: seniorName,
    meds: {
      scheduled_count: scheduledCount,
      taken_count: takenCount,
      missed,
      adherence_pct: adherencePct,
    },
    stock,
    sos,
    flags,
  };

  if (windowActivity.length > 0) {
    digest.activity = {
      interactions_count: windowActivity.length,
      first_active_time: getISTParts(windowActivity[0].at).timeStr,
      last_active_time: getISTParts(windowActivity[windowActivity.length - 1].at).timeStr,
    };
  }

  return digest;
}
