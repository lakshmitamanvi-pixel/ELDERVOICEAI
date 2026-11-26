export const IST_TIMEZONE = 'Asia/Kolkata';
export const IST_OFFSET_MS = 330 * 60 * 1000; // UTC+05:30 (no DST)

export const VALID_UNITS = ['tablet', 'ml', 'capsule'];
export const VALID_SCHEDULE_TYPES = ['daily', 'every_n_days', 'weekdays', 'as_needed'];
export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const TIME_24H_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_YMD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Format a Date (or ISO string) into Asia/Kolkata local parts.
 */
export function getISTParts(dateInput = new Date()) {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) {
    return getISTParts(new Date());
  }
  const shifted = new Date(date.getTime() + IST_OFFSET_MS);
  const year = shifted.getUTCFullYear();
  const month = shifted.getUTCMonth() + 1;
  const day = shifted.getUTCDate();
  const hour = shifted.getUTCHours();
  const minute = shifted.getUTCMinutes();
  const weekday = shifted.getUTCDay(); // 0 (Sun) .. 6 (Sat)

  const pad = (n) => String(n).padStart(2, '0');
  return {
    year,
    month,
    day,
    hour,
    minute,
    weekday,
    dateStr: `${year}-${pad(month)}-${pad(day)}`,
    timeStr: `${pad(hour)}:${pad(minute)}`,
  };
}

/**
 * Convert an IST date string (YYYY-MM-DD) and optional HH:MM into a UTC Date.
 */
export function istDateTimeToUTC(dateStr, timeStr = '00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  const utcMs = Date.UTC(y, m - 1, d, hh, mm, 0, 0) - IST_OFFSET_MS;
  return new Date(utcMs);
}

/**
 * Add N calendar days to an IST YYYY-MM-DD string.
 */
export function addDaysToISTDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  const pad = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/**
 * Return difference in calendar days (targetDateStr - baseDateStr).
 */
export function diffISTDays(baseDateStr, targetDateStr) {
  const [by, bm, bd] = baseDateStr.split('-').map(Number);
  const [ty, tm, td] = targetDateStr.split('-').map(Number);
  const baseMs = Date.UTC(by, bm - 1, bd);
  const targetMs = Date.UTC(ty, tm - 1, td);
  return Math.round((targetMs - baseMs) / 86400000);
}

/**
 * Return weekday (0=Sun..6=Sat) for an IST YYYY-MM-DD string.
 */
export function getWeekdayOfISTDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/**
 * Safely migrate/normalize a legacy or partial medicine record to the Phase 1 schema.
 */
export function normalizeMedicine(raw = {}) {
  const scheduleType = VALID_SCHEDULE_TYPES.includes(raw.schedule_type)
    ? raw.schedule_type
    : 'daily';

  const unit = VALID_UNITS.includes(raw.unit) ? raw.unit : 'tablet';

  const rawDose = Number(raw.dose_per_intake);
  const dosePerIntake = Number.isFinite(rawDose) && rawDose > 0 ? rawDose : 1;

  const rawStock = Number(raw.stock_count);
  const stockCount = Number.isFinite(rawStock) && rawStock >= 0 ? rawStock : 0;

  const rawLead = Number(raw.lead_days);
  const leadDays = Number.isFinite(rawLead) && rawLead >= 0 ? Math.floor(rawLead) : 3;

  const rawPack = raw.pack_size !== undefined && raw.pack_size !== null && raw.pack_size !== ''
    ? Number(raw.pack_size)
    : null;
  const packSize = rawPack !== null && Number.isFinite(rawPack) && rawPack > 0 ? rawPack : null;

  let timesOfDay = [];
  if (scheduleType !== 'as_needed') {
    if (Array.isArray(raw.times_of_day) && raw.times_of_day.length > 0) {
      timesOfDay = raw.times_of_day.filter((t) => TIME_24H_REGEX.test(String(t).trim()));
    } else if (raw.scheduleTime && TIME_24H_REGEX.test(String(raw.scheduleTime).trim())) {
      timesOfDay = [String(raw.scheduleTime).trim()];
    } else {
      timesOfDay = ['08:00'];
    }
    timesOfDay = Array.from(new Set(timesOfDay)).sort();
  }

  const rawInterval = Number(raw.interval_days);
  const intervalDays =
    scheduleType === 'every_n_days'
      ? Number.isFinite(rawInterval) && rawInterval >= 1
        ? Math.floor(rawInterval)
        : 2
      : null;

  let weekdays = null;
  if (scheduleType === 'weekdays') {
    if (Array.isArray(raw.weekdays) && raw.weekdays.length > 0) {
      weekdays = Array.from(
        new Set(raw.weekdays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))
      ).sort((a, b) => a - b);
    } else {
      weekdays = [1, 3, 5];
    }
  }

  const stockUpdatedAt =
    raw.stock_updated_at && !Number.isNaN(Date.parse(raw.stock_updated_at))
      ? new Date(raw.stock_updated_at).toISOString()
      : raw.updatedAt && !Number.isNaN(Date.parse(raw.updatedAt))
      ? new Date(raw.updatedAt).toISOString()
      : raw.createdAt && !Number.isNaN(Date.parse(raw.createdAt))
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString();

  const courseEndDate =
    raw.course_end_date && DATE_YMD_REGEX.test(String(raw.course_end_date).trim())
      ? String(raw.course_end_date).trim()
      : null;

  const strength = raw.strength !== undefined ? String(raw.strength) : String(raw.dosage || '');
  const primaryTime = timesOfDay[0] || raw.scheduleTime || '08:00';
  const displayDosage =
    raw.dosage ||
    [strength, `${dosePerIntake} ${unit}${dosePerIntake === 1 ? '' : 's'}`].filter(Boolean).join(' • ');

  return {
    ...raw,
    name: String(raw.name || '').trim(),
    strength: strength.trim(),
    dosage: displayDosage,
    dose_per_intake: dosePerIntake,
    unit,
    schedule_type: scheduleType,
    times_of_day: timesOfDay,
    scheduleTime: scheduleType === 'as_needed' ? raw.scheduleTime || 'PRN' : primaryTime,
    interval_days: intervalDays,
    weekdays,
    stock_count: stockCount,
    stock_updated_at: stockUpdatedAt,
    course_end_date: courseEndDate,
    lead_days: leadDays,
    pack_size: packSize,
    active: raw.active !== undefined ? Boolean(raw.active) : true,
    status: raw.status || 'pending',
    instructions: raw.instructions || '',
  };
}

/**
 * Validate medicine fields before saving.
 * Enforces: dose_per_intake > 0, stock_count >= 0, valid times, no duplicate times.
 */
export function validateMedicine(med) {
  const errors = [];

  if (!med.name || !String(med.name).trim()) {
    errors.push('Medication name is required.');
  }

  const dose = Number(med.dose_per_intake);
  if (!Number.isFinite(dose) || dose <= 0) {
    errors.push('Dose per intake must be greater than 0 (e.g. 0.25, 0.5, 1).');
  }

  if (!VALID_UNITS.includes(med.unit)) {
    errors.push('Unit must be tablet, ml, or capsule.');
  }

  const stock = Number(med.stock_count);
  if (!Number.isFinite(stock) || stock < 0) {
    errors.push('Stock count must be 0 or greater.');
  }

  const leadDays = Number(med.lead_days ?? 3);
  if (!Number.isFinite(leadDays) || leadDays < 0) {
    errors.push('Lead days must be 0 or greater.');
  }

  if (med.pack_size !== null && med.pack_size !== undefined && med.pack_size !== '') {
    const pack = Number(med.pack_size);
    if (!Number.isFinite(pack) || pack <= 0) {
      errors.push('Pack size must be greater than 0.');
    }
  }

  if (!VALID_SCHEDULE_TYPES.includes(med.schedule_type)) {
    errors.push('Invalid schedule type.');
  }

  if (med.schedule_type !== 'as_needed') {
    const times = Array.isArray(med.times_of_day) ? med.times_of_day : [];
    if (times.length === 0) {
      errors.push('At least one schedule time (HH:MM) is required.');
    } else {
      const seen = new Set();
      for (const rawTime of times) {
        const t = String(rawTime || '').trim();
        if (!TIME_24H_REGEX.test(t)) {
          errors.push(`Invalid time "${t}". Use 24-hour HH:MM format (e.g. 08:00, 20:00).`);
          break;
        }
        if (seen.has(t)) {
          errors.push(`Duplicate schedule time "${t}" is not allowed.`);
          break;
        }
        seen.add(t);
      }
    }
  }

  if (med.schedule_type === 'every_n_days') {
    const interval = Number(med.interval_days);
    if (!Number.isInteger(interval) || interval < 1) {
      errors.push('Interval days must be a whole number of at least 1.');
    }
  }

  if (med.schedule_type === 'weekdays') {
    const days = Array.isArray(med.weekdays) ? med.weekdays : [];
    if (days.length === 0) {
      errors.push('Select at least one weekday.');
    } else if (days.some((d) => !Number.isInteger(Number(d)) || Number(d) < 0 || Number(d) > 6)) {
      errors.push('Weekdays must be between 0 (Sun) and 6 (Sat).');
    }
  }

  if (med.course_end_date) {
    if (!DATE_YMD_REGEX.test(String(med.course_end_date).trim())) {
      errors.push('Course end date must be in YYYY-MM-DD format.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function isScheduledOnISTDate(med, istDateStr, anchorISTDateStr) {
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
    const delta = diffISTDays(anchorISTDateStr, istDateStr);
    return delta >= 0 && delta % interval === 0;
  }
  return false;
}

/**
 * Predict when a medicine will run out using Asia/Kolkata schedule & date logic.
 */
export function predictMedicineRunOut(rawMed, nowInput = new Date()) {
  const med = normalizeMedicine(rawMed);
  const now = nowInput instanceof Date ? nowInput : new Date(nowInput);
  const nowIST = getISTParts(now);

  if (!med.active) {
    return {
      canPredict: false,
      status: 'inactive',
      message: 'Inactive medicine',
      shouldAlert: false,
      alertSeverity: 'none',
      dosesRemaining: Math.floor(med.stock_count / med.dose_per_intake),
      daysRemaining: null,
      runOutDateIST: null,
      runOutAtUTC: null,
      restockByDateIST: null,
    };
  }

  if (med.schedule_type === 'as_needed') {
    return {
      canPredict: false,
      status: 'as_needed',
      message: "no schedule: can't predict",
      shouldAlert: false,
      alertSeverity: 'none',
      dosesRemaining: Math.floor(med.stock_count / med.dose_per_intake),
      daysRemaining: null,
      runOutDateIST: null,
      runOutAtUTC: null,
      restockByDateIST: null,
    };
  }

  const dosesRemaining = Math.floor((med.stock_count + 1e-9) / med.dose_per_intake);

  if (med.stock_count <= 0 || dosesRemaining <= 0) {
    return {
      canPredict: true,
      status: 'out_of_stock',
      message: 'Out of stock now',
      shouldAlert: true,
      alertSeverity: 'critical',
      dosesRemaining: 0,
      daysRemaining: 0,
      runOutDateIST: nowIST.dateStr,
      runOutAtUTC: now.toISOString(),
      restockByDateIST: nowIST.dateStr,
    };
  }

  const anchorIST = getISTParts(med.stock_updated_at || now).dateStr;
  const times = [...med.times_of_day].sort();
  let remainingUnits = med.stock_count;
  let lastIntakeDateIST = null;
  let lastIntakeTime = null;
  let runOutDateIST = null;
  let runOutTime = null;

  // Simulate up to 730 days (2 years) to find exact depletion intake
  const maxDays = 730;
  for (let dayOffset = 0; dayOffset <= maxDays; dayOffset++) {
    const candidateDate = addDaysToISTDate(nowIST.dateStr, dayOffset);

    if (med.course_end_date && candidateDate > med.course_end_date) {
      break;
    }

    if (!isScheduledOnISTDate(med, candidateDate, anchorIST)) {
      continue;
    }

    for (const timeStr of times) {
      // On today's date, skip intakes that already passed before `now`
      if (dayOffset === 0 && timeStr <= nowIST.timeStr) {
        continue;
      }

      if (remainingUnits + 1e-9 < med.dose_per_intake) {
        runOutDateIST = candidateDate;
        runOutTime = timeStr;
        break;
      }

      remainingUnits = Number((remainingUnits - med.dose_per_intake).toFixed(4));
      lastIntakeDateIST = candidateDate;
      lastIntakeTime = timeStr;

      if (remainingUnits + 1e-9 < med.dose_per_intake) {
        runOutDateIST = candidateDate;
        runOutTime = timeStr;
        break;
      }
    }

    if (runOutDateIST) {
      break;
    }
  }

  // If course_end_date is set and stock lasts through the entire course
  if (!runOutDateIST && med.course_end_date) {
    return {
      canPredict: true,
      status: 'course_sufficient',
      message: `Sufficient through course end (${med.course_end_date})`,
      shouldAlert: false,
      alertSeverity: 'ok',
      dosesRemaining,
      daysRemaining: null,
      runOutDateIST: null,
      runOutAtUTC: null,
      restockByDateIST: null,
    };
  }

  if (!runOutDateIST) {
    return {
      canPredict: true,
      status: 'long_supply',
      message: '2+ years supply on hand',
      shouldAlert: false,
      alertSeverity: 'ok',
      dosesRemaining,
      daysRemaining: 730,
      runOutDateIST: null,
      runOutAtUTC: null,
      restockByDateIST: null,
    };
  }

  const effectiveRunOutDate = runOutDateIST || lastIntakeDateIST || nowIST.dateStr;
  const effectiveRunOutTime = runOutTime || lastIntakeTime || '08:00';
  const daysRemaining = Math.max(0, diffISTDays(nowIST.dateStr, effectiveRunOutDate));
  const restockByDateIST = addDaysToISTDate(effectiveRunOutDate, -med.lead_days);
  const shouldAlert = daysRemaining <= med.lead_days;
  const alertSeverity = daysRemaining <= 1 ? 'critical' : shouldAlert ? 'warning' : 'ok';

  return {
    canPredict: true,
    status: shouldAlert ? 'restock_due' : 'ok',
    message:
      daysRemaining === 0
        ? `Runs out today (${effectiveRunOutDate})`
        : daysRemaining === 1
        ? `Runs out tomorrow (${effectiveRunOutDate})`
        : `Runs out in ${daysRemaining} days (${effectiveRunOutDate})`,
    shouldAlert,
    alertSeverity,
    dosesRemaining,
    daysRemaining,
    runOutDateIST: effectiveRunOutDate,
    runOutAtUTC: istDateTimeToUTC(effectiveRunOutDate, effectiveRunOutTime).toISOString(),
    restockByDateIST,
  };
}

/**
 * Build restock reminder alerts for active scheduled medicines (skips as_needed & inactive).
 */
export function buildRestockAlerts(medications = [], now = new Date()) {
  const alerts = [];

  for (const rawMed of medications) {
    const med = normalizeMedicine(rawMed);
    const prediction = predictMedicineRunOut(med, now);

    if (!prediction.canPredict || !prediction.shouldAlert) {
      continue;
    }

    const refillHint = med.pack_size
      ? ` Recommended refill: 1 pack (${med.pack_size} ${med.unit}s).`
      : '';

    alerts.push({
      id: `restock-${med.id}`,
      medicineId: med.id,
      title:
        prediction.alertSeverity === 'critical'
          ? `Urgent Restock: ${med.name}`
          : `Restock Reminder: ${med.name}`,
      message: `${prediction.message}. Stock left: ${med.stock_count} ${med.unit}${
        med.stock_count === 1 ? '' : 's'
      } (${prediction.dosesRemaining} doses).${refillHint}`,
      type: prediction.alertSeverity === 'critical' ? 'alert' : 'warning',
      severity: prediction.alertSeverity,
      timestamp: new Date(med.stock_updated_at || now),
      prediction,
    });
  }

  return alerts.sort((a, b) => (a.prediction.daysRemaining ?? 999) - (b.prediction.daysRemaining ?? 999));
}
