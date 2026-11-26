import assert from 'node:assert/strict';
import {
  normalizeMedicine,
  validateMedicine,
  predictMedicineRunOut,
  buildRestockAlerts,
  getISTParts,
} from '../src/utils/medicinePrediction.js';

// 1. Legacy migration with safe defaults
{
  const legacy = {
    id: 'med-legacy',
    name: 'Lisinopril',
    dosage: '10mg',
    scheduleTime: '08:00',
    status: 'pending',
  };
  const migrated = normalizeMedicine(legacy);
  assert.equal(migrated.strength, '10mg');
  assert.equal(migrated.dose_per_intake, 1);
  assert.equal(migrated.unit, 'tablet');
  assert.equal(migrated.schedule_type, 'daily');
  assert.deepEqual(migrated.times_of_day, ['08:00']);
  assert.equal(migrated.stock_count, 0);
  assert.equal(migrated.lead_days, 3);
  assert.equal(migrated.active, true);
  assert.ok(!Number.isNaN(Date.parse(migrated.stock_updated_at)));
}

// 2. Validation rules: fractional doses allowed, invalid/duplicate times rejected, stock >= 0
{
  const validHalf = validateMedicine({
    name: 'Atorvastatin',
    dose_per_intake: 0.25,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['08:00', '20:00'],
    stock_count: 0,
    lead_days: 3,
  });
  assert.equal(validHalf.valid, true);

  const zeroDose = validateMedicine({
    name: 'BadDose',
    dose_per_intake: 0,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['08:00'],
    stock_count: 5,
  });
  assert.equal(zeroDose.valid, false);

  const negStock = validateMedicine({
    name: 'NegStock',
    dose_per_intake: 1,
    unit: 'ml',
    schedule_type: 'daily',
    times_of_day: ['08:00'],
    stock_count: -1,
  });
  assert.equal(negStock.valid, false);

  const dupTimes = validateMedicine({
    name: 'DupTimes',
    dose_per_intake: 1,
    unit: 'capsule',
    schedule_type: 'daily',
    times_of_day: ['08:00', '08:00'],
    stock_count: 10,
  });
  assert.equal(dupTimes.valid, false);

  const badTime = validateMedicine({
    name: 'BadTime',
    dose_per_intake: 1,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['25:00'],
    stock_count: 10,
  });
  assert.equal(badTime.valid, false);
}

// 3. as_needed meds: NO prediction, exact message, skip alerts
{
  const prn = normalizeMedicine({
    id: 'med-prn',
    name: 'Paracetamol',
    dose_per_intake: 1,
    unit: 'tablet',
    schedule_type: 'as_needed',
    stock_count: 1,
    lead_days: 3,
    active: true,
  });
  const pred = predictMedicineRunOut(prn, new Date('2026-11-26T04:00:00Z'));
  assert.equal(pred.canPredict, false);
  assert.equal(pred.message, "no schedule: can't predict");
  assert.equal(pred.shouldAlert, false);

  const alerts = buildRestockAlerts([prn], new Date('2026-11-26T04:00:00Z'));
  assert.equal(alerts.length, 0);
}

// 4. Asia/Kolkata timezone & daily run-out prediction
{
  // 2026-11-26T18:45:00Z is 2026-11-27 00:15 IST
  const now = new Date('2026-11-26T18:45:00Z');
  const ist = getISTParts(now);
  assert.equal(ist.dateStr, '2026-11-27');
  assert.equal(ist.timeStr, '00:15');

  const med = normalizeMedicine({
    id: 'med-daily',
    name: 'Metformin',
    dose_per_intake: 0.5,
    unit: 'tablet',
    schedule_type: 'daily',
    times_of_day: ['08:00', '20:00'],
    stock_count: 2, // 4 doses -> 27th 08:00, 27th 20:00, 28th 08:00, 28th 20:00 (runs out 2026-11-28)
    stock_updated_at: now.toISOString(),
    lead_days: 3,
    active: true,
  });

  const pred = predictMedicineRunOut(med, now);
  assert.equal(pred.canPredict, true);
  assert.equal(pred.dosesRemaining, 4);
  assert.equal(pred.runOutDateIST, '2026-11-28');
  assert.equal(pred.daysRemaining, 1);
  assert.equal(pred.shouldAlert, true);
  assert.equal(pred.alertSeverity, 'critical');
}

// 5. every_n_days and course_end_date
{
  const now = new Date('2026-11-27T01:00:00Z'); // 06:30 IST on 2026-11-27
  const med = normalizeMedicine({
    id: 'med-course',
    name: 'Azithromycin',
    dose_per_intake: 1,
    unit: 'tablet',
    schedule_type: 'every_n_days',
    interval_days: 2,
    times_of_day: ['09:00'],
    stock_count: 5,
    stock_updated_at: now.toISOString(),
    course_end_date: '2026-12-01', // 27, 29, 01 = 3 doses needed; 5 on hand -> sufficient
    lead_days: 3,
    active: true,
  });

  const pred = predictMedicineRunOut(med, now);
  assert.equal(pred.canPredict, true);
  assert.equal(pred.status, 'course_sufficient');
  assert.equal(pred.shouldAlert, false);
}

console.log('All medicine prediction & validation tests passed!');
