import React, { useState } from 'react';
import {
  Plus,
  Edit2,
  Trash2,
  Pill,
  Check,
  X,
  Clock,
  AlertTriangle,
  PackagePlus,
  CalendarClock,
} from 'lucide-react';
import {
  VALID_UNITS,
  WEEKDAY_LABELS,
  normalizeMedicine,
  validateMedicine,
  predictMedicineRunOut,
} from '../../utils/medicinePrediction.js';

const DEFAULT_FORM = {
  name: '',
  strength: '',
  dose_per_intake: 1,
  unit: 'tablet',
  schedule_type: 'daily',
  times_of_day: ['08:00'],
  interval_days: 2,
  weekdays: [1, 3, 5],
  stock_count: 10,
  lead_days: 3,
  pack_size: '',
  course_end_date: '',
  active: true,
  status: 'pending',
  instructions: '',
};

export const MedicationScheduleManager = ({
  medications = [],
  onAddMedication,
  onUpdateMedication,
  onDeleteMedication,
  onRefillMedication,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [formData, setFormData] = useState(DEFAULT_FORM);

  const resetForm = () => {
    setFormData(DEFAULT_FORM);
    setEditingId(null);
    setIsAdding(false);
    setValidationError('');
  };

  const handleStartEdit = (rawMed) => {
    const med = normalizeMedicine(rawMed);
    setFormData({
      name: med.name || '',
      strength: med.strength || '',
      dose_per_intake: med.dose_per_intake ?? 1,
      unit: med.unit || 'tablet',
      schedule_type: med.schedule_type || 'daily',
      times_of_day:
        med.schedule_type === 'as_needed'
          ? []
          : med.times_of_day?.length > 0
          ? med.times_of_day
          : ['08:00'],
      interval_days: med.interval_days || 2,
      weekdays: med.weekdays?.length > 0 ? med.weekdays : [1, 3, 5],
      stock_count: med.stock_count ?? 0,
      lead_days: med.lead_days ?? 3,
      pack_size: med.pack_size ?? '',
      course_end_date: med.course_end_date || '',
      active: med.active !== undefined ? med.active : true,
      status: med.status || 'pending',
      instructions: med.instructions || '',
    });
    setEditingId(med.id);
    setIsAdding(true);
    setValidationError('');
  };

  const handleAddTime = () => {
    setFormData((prev) => ({
      ...prev,
      times_of_day: [...prev.times_of_day, '20:00'],
    }));
  };

  const handleUpdateTime = (index, value) => {
    setFormData((prev) => {
      const next = [...prev.times_of_day];
      next[index] = value;
      return { ...prev, times_of_day: next };
    });
  };

  const handleRemoveTime = (index) => {
    setFormData((prev) => ({
      ...prev,
      times_of_day: prev.times_of_day.filter((_, idx) => idx !== index),
    }));
  };

  const handleToggleWeekday = (dayIdx) => {
    setFormData((prev) => {
      const exists = prev.weekdays.includes(dayIdx);
      const next = exists
        ? prev.weekdays.filter((d) => d !== dayIdx)
        : [...prev.weekdays, dayIdx].sort((a, b) => a - b);
      return { ...prev, weekdays: next };
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const candidate = {
      ...formData,
      dose_per_intake: Number(formData.dose_per_intake),
      stock_count: Number(formData.stock_count),
      lead_days: Number(formData.lead_days),
      interval_days:
        formData.schedule_type === 'every_n_days' ? Number(formData.interval_days) : null,
      pack_size: formData.pack_size !== '' ? Number(formData.pack_size) : null,
      course_end_date: formData.course_end_date || null,
      times_of_day: formData.schedule_type === 'as_needed' ? [] : formData.times_of_day,
    };

    const validation = validateMedicine(candidate);
    if (!validation.valid) {
      setValidationError(validation.errors[0]);
      return;
    }

    const nowIso = new Date().toISOString();
    const payload = normalizeMedicine({
      ...candidate,
      stock_updated_at: nowIso,
      dosage: [
        candidate.strength,
        `${candidate.dose_per_intake} ${candidate.unit}${candidate.dose_per_intake === 1 ? '' : 's'}`,
      ]
        .filter(Boolean)
        .join(' • '),
    });

    setIsSubmitting(true);
    try {
      if (editingId) {
        await onUpdateMedication(editingId, payload);
      } else {
        await onAddMedication(payload);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to submit medication:', err);
      setValidationError(err.message || 'Failed to save to Firestore. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsSubmitting(true);
    try {
      await onDeleteMedication(id);
      setDeletingId(null);
    } catch (err) {
      console.error('Failed to delete medication:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatScheduleSummary = (med) => {
    const times = med.times_of_day?.length ? med.times_of_day.join(', ') : med.scheduleTime;
    if (med.schedule_type === 'as_needed') return 'As needed (no schedule)';
    if (med.schedule_type === 'every_n_days') {
      return `Every ${med.interval_days || 1} day(s) • ${times}`;
    }
    if (med.schedule_type === 'weekdays') {
      const days = (med.weekdays || []).map((d) => WEEKDAY_LABELS[d]).join(', ');
      return `${days || 'Weekdays'} • ${times}`;
    }
    return `Daily • ${times}`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-elderBlue-950">Medication Schedules & Stock</h3>
          <p className="text-lg text-elderBlue-700 font-medium mt-0.5">
            Configure prescriptions, stock counts, and Asia/Kolkata run-out predictions.
          </p>
        </div>
        {!isAdding && (
          <button
            onClick={() => {
              resetForm();
              setIsAdding(true);
            }}
            className="min-h-[60px] px-6 py-3 rounded-2xl bg-elderBlue-900 text-warmWhite hover:bg-elderBlue-950 font-bold text-xl flex items-center justify-center gap-2 transition-all shadow-md focus:ring-4 focus:ring-elderBlue-400"
          >
            <Plus className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
            <span>Add Medication</span>
          </button>
        )}
      </div>

      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="bg-warmWhite-paper border-3 border-elderBlue-300 rounded-3xl p-4 sm:p-8 shadow-xl space-y-6"
        >
          <div className="flex items-center justify-between pb-4 border-b-2 border-elderBlue-200">
            <h4 className="text-2xl font-bold text-elderBlue-950">
              {editingId ? 'Edit Medication Schedule' : 'Add New Medication'}
            </h4>
            <button
              type="button"
              onClick={resetForm}
              aria-label="Cancel editing"
              className="p-2 text-elderBlue-700 hover:text-elderBlue-950 rounded-xl hover:bg-elderBlue-100"
            >
              <X className="w-7 h-7" aria-hidden="true" />
            </button>
          </div>

          {validationError && (
            <div className="p-4 rounded-2xl bg-crimsonAlert-50 border-2 border-crimsonAlert-300 text-crimsonAlert-900 text-lg font-bold flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 stroke-[2.5] text-crimsonAlert-700 flex-shrink-0" aria-hidden="true" />
              <span>{validationError}</span>
            </div>
          )}

          {/* Row 1: Name, Strength, Dose & Unit */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <label htmlFor="med-name" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Medication Name *
              </label>
              <input
                id="med-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Lisinopril, Metformin"
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="med-strength" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Strength
              </label>
              <input
                id="med-strength"
                type="text"
                value={formData.strength}
                onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                placeholder="e.g. 10mg, 500mg"
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="med-dose" className="block text-lg font-bold text-elderBlue-900 mb-2">
                  Dose *
                </label>
                <input
                  id="med-dose"
                  type="number"
                  step="0.25"
                  min="0.25"
                  required
                  value={formData.dose_per_intake}
                  onChange={(e) => setFormData({ ...formData, dose_per_intake: e.target.value })}
                  className="w-full min-h-[56px] px-3 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
                />
              </div>
              <div>
                <label htmlFor="med-unit" className="block text-lg font-bold text-elderBlue-900 mb-2">
                  Unit *
                </label>
                <select
                  id="med-unit"
                  value={formData.unit}
                  onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                  className="w-full min-h-[56px] px-3 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
                >
                  {VALID_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Row 2: Schedule Type & Conditional Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="med-schedule-type" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Schedule Type *
              </label>
              <select
                id="med-schedule-type"
                value={formData.schedule_type}
                onChange={(e) => {
                  const nextType = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    schedule_type: nextType,
                    times_of_day:
                      nextType === 'as_needed'
                        ? []
                        : prev.times_of_day.length > 0
                        ? prev.times_of_day
                        : ['08:00'],
                  }));
                }}
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              >
                <option value="daily">Daily</option>
                <option value="every_n_days">Every N Days</option>
                <option value="weekdays">Specific Weekdays</option>
                <option value="as_needed">As Needed (PRN)</option>
              </select>
            </div>

            {formData.schedule_type === 'every_n_days' && (
              <div>
                <label htmlFor="med-interval" className="block text-lg font-bold text-elderBlue-900 mb-2">
                  Interval (Days) *
                </label>
                <input
                  id="med-interval"
                  type="number"
                  min="1"
                  step="1"
                  value={formData.interval_days}
                  onChange={(e) => setFormData({ ...formData, interval_days: e.target.value })}
                  className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
                />
              </div>
            )}

            {formData.schedule_type === 'weekdays' && (
              <div className="md:col-span-2">
                <span className="block text-lg font-bold text-elderBlue-900 mb-2">Weekdays *</span>
                <div className="flex flex-wrap gap-2">
                  {WEEKDAY_LABELS.map((label, idx) => {
                    const selected = formData.weekdays.includes(idx);
                    return (
                      <button
                        key={label}
                        type="button"
                        onClick={() => handleToggleWeekday(idx)}
                        className={`min-h-[48px] px-4 rounded-xl font-bold text-base border-2 transition-colors ${
                          selected
                            ? 'bg-elderBlue-800 text-white border-elderBlue-900'
                            : 'bg-white text-elderBlue-900 border-elderBlue-200 hover:bg-elderBlue-50'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Times of day (hidden for as_needed) */}
          {formData.schedule_type !== 'as_needed' ? (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-lg font-bold text-elderBlue-900">
                  Times of Day (IST 24h) *
                </span>
                <button
                  type="button"
                  onClick={handleAddTime}
                  className="px-3 py-1.5 rounded-xl bg-elderBlue-100 hover:bg-elderBlue-200 text-elderBlue-900 font-bold text-base flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  <span>Add Time</span>
                </button>
              </div>
              <div className="flex flex-wrap gap-3">
                {formData.times_of_day.map((timeVal, idx) => (
                  <div key={idx} className="flex items-center gap-1.5 bg-white border-2 border-elderBlue-200 rounded-2xl p-1.5">
                    <input
                      type="time"
                      required
                      value={timeVal}
                      onChange={(e) => handleUpdateTime(idx, e.target.value)}
                      className="min-h-[44px] px-2 text-lg font-semibold text-elderBlue-950 focus:outline-none"
                    />
                    {formData.times_of_day.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveTime(idx)}
                        aria-label={`Remove time ${timeVal}`}
                        className="p-2 text-crimsonAlert-700 hover:bg-crimsonAlert-50 rounded-xl"
                      >
                        <X className="w-5 h-5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-base font-bold text-elderBlue-700 bg-elderBlue-50 px-4 py-3 rounded-2xl border border-elderBlue-200">
              As-needed medicines have no fixed schedule: run-out prediction and restock alerts are skipped.
            </p>
          )}

          {/* Row 3: Stock, Lead Days, Pack Size, Course End Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <label htmlFor="med-stock" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Stock on Hand *
              </label>
              <input
                id="med-stock"
                type="number"
                step="0.25"
                min="0"
                required
                value={formData.stock_count}
                onChange={(e) => setFormData({ ...formData, stock_count: e.target.value })}
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="med-lead-days" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Restock Lead Days
              </label>
              <input
                id="med-lead-days"
                type="number"
                min="0"
                step="1"
                value={formData.lead_days}
                onChange={(e) => setFormData({ ...formData, lead_days: e.target.value })}
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="med-pack-size" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Pack Size (Optional)
              </label>
              <input
                id="med-pack-size"
                type="number"
                min="1"
                step="1"
                value={formData.pack_size}
                onChange={(e) => setFormData({ ...formData, pack_size: e.target.value })}
                placeholder="e.g. 30"
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="med-course-end" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Course End (Optional)
              </label>
              <input
                id="med-course-end"
                type="date"
                value={formData.course_end_date}
                onChange={(e) => setFormData({ ...formData, course_end_date: e.target.value })}
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          {/* Row 4: Active, Status, Instructions */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <label className="flex items-center gap-3 min-h-[56px] px-4 bg-white border-3 border-elderBlue-200 rounded-2xl cursor-pointer">
              <input
                type="checkbox"
                checked={formData.active}
                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                className="w-6 h-6 accent-elderBlue-800"
              />
              <span className="text-lg font-bold text-elderBlue-950">Active Prescription</span>
            </label>

            <div>
              <label htmlFor="med-status" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Dose Status
              </label>
              <select
                id="med-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed Taken</option>
                <option value="missed">Missed</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="med-instructions" className="block text-lg font-bold text-elderBlue-900 mb-2">
                Administration Instructions (Spoken to Senior)
              </label>
              <input
                id="med-instructions"
                type="text"
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                placeholder="e.g. Take with breakfast and a tall glass of water."
                className="w-full min-h-[56px] px-4 text-lg font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center justify-end gap-3 sm:gap-4 pt-4 border-t-2 border-elderBlue-200">
            <button
              type="button"
              onClick={resetForm}
              className="w-full sm:w-auto min-h-[56px] px-6 py-3 rounded-2xl border-2 border-elderBlue-300 text-elderBlue-900 font-bold text-xl hover:bg-elderBlue-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto min-h-[56px] px-8 py-3 rounded-2xl bg-emeraldSuccess-700 hover:bg-emeraldSuccess-800 text-white font-bold text-xl flex items-center justify-center gap-2 shadow-md focus:ring-4 focus:ring-emeraldSuccess-300"
            >
              {isSubmitting ? (
                <>
                  <div className="w-6 h-6 border-3 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check className="w-6 h-6 stroke-[3]" aria-hidden="true" />
                  <span>{editingId ? 'Update Medication' : 'Save to Schedule'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Medication Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {medications.map((rawMed) => {
          const med = normalizeMedicine(rawMed);
          const prediction = predictMedicineRunOut(med);
          const refillAmount = med.pack_size || 10;

          return (
            <div
              key={med.id}
              className={`bg-white border-3 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col justify-between transition-colors min-w-0 ${
                !med.active
                  ? 'border-elderBlue-100 opacity-75'
                  : prediction.alertSeverity === 'critical'
                  ? 'border-crimsonAlert-300'
                  : prediction.shouldAlert
                  ? 'border-amber-300'
                  : 'border-elderBlue-100 hover:border-elderBlue-300'
              }`}
            >
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className="p-3 bg-elderBlue-100 text-elderBlue-900 rounded-2xl flex-shrink-0">
                      <Pill className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-xl sm:text-2xl font-bold text-elderBlue-950 break-words">{med.name}</h4>
                        {!med.active && (
                          <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-elderBlue-100 text-elderBlue-700">
                            Inactive
                          </span>
                        )}
                      </div>
                      <span className="text-base sm:text-lg font-bold text-elderBlue-700 break-words">
                        {med.strength ? `${med.strength} • ` : ''}
                        {med.dose_per_intake} {med.unit}
                        {med.dose_per_intake === 1 ? '' : 's'} / intake
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 px-3 py-1 bg-elderBlue-50 border border-elderBlue-200 rounded-xl text-sm sm:text-base font-bold text-elderBlue-900 flex-shrink-0">
                    <Clock className="w-4 h-4 text-elderBlue-700" aria-hidden="true" />
                    <span>{formatScheduleSummary(med)}</span>
                  </div>
                </div>

                {/* Stock & Run-Out Prediction Banner */}
                <div
                  className={`p-3 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-2 ${
                    prediction.alertSeverity === 'critical'
                      ? 'bg-crimsonAlert-50 border-crimsonAlert-200 text-crimsonAlert-900'
                      : prediction.shouldAlert
                      ? 'bg-amber-50 border-amber-200 text-amber-950'
                      : 'bg-elderBlue-50/70 border-elderBlue-100 text-elderBlue-900'
                  }`}
                >
                  <div className="flex items-center gap-2 text-sm sm:text-base font-bold">
                    <CalendarClock className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
                    <span>
                      Stock: {med.stock_count} {med.unit}
                      {med.stock_count === 1 ? '' : 's'} • {prediction.message}
                    </span>
                  </div>
                  {med.course_end_date && (
                    <span className="text-xs sm:text-sm font-bold opacity-80">
                      Course ends: {med.course_end_date}
                    </span>
                  )}
                </div>

                {med.instructions && (
                  <p className="text-base sm:text-lg text-elderBlue-800 font-medium bg-warmWhite-paper p-3 rounded-xl border border-elderBlue-100 break-words">
                    {med.instructions}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 mt-5 pt-4 border-t-2 border-elderBlue-50">
                <span className="text-base font-bold text-elderBlue-600 uppercase tracking-wide">
                  Status: <strong className="text-elderBlue-950">{med.status}</strong>
                </span>

                <div className="flex flex-wrap items-center gap-2">
                  {onRefillMedication && (
                    <button
                      type="button"
                      onClick={() => onRefillMedication(med, refillAmount)}
                      aria-label={`Refill ${med.name} by ${refillAmount}`}
                      className="min-h-[48px] px-3.5 py-2 rounded-xl bg-emeraldSuccess-50 text-emeraldSuccess-900 hover:bg-emeraldSuccess-100 font-bold text-base flex items-center gap-1.5 border border-emeraldSuccess-300"
                    >
                      <PackagePlus className="w-5 h-5" aria-hidden="true" />
                      <span>+{refillAmount} Refill</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleStartEdit(med)}
                    aria-label={`Edit ${med.name}`}
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-elderBlue-50 text-elderBlue-900 hover:bg-elderBlue-100 font-bold text-base flex items-center gap-1.5 border border-elderBlue-200"
                  >
                    <Edit2 className="w-5 h-5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>

                  {deletingId === med.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(med.id)}
                        disabled={isSubmitting}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-crimsonAlert-700 text-white font-bold text-base hover:bg-crimsonAlert-800"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeletingId(null)}
                        className="min-h-[48px] px-3 py-2 rounded-xl bg-elderBlue-100 text-elderBlue-900 font-bold text-base"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeletingId(med.id)}
                      aria-label={`Delete ${med.name}`}
                      className="min-h-[48px] px-4 py-2 rounded-xl bg-crimsonAlert-50 text-crimsonAlert-900 hover:bg-crimsonAlert-100 font-bold text-base flex items-center gap-1.5 border border-crimsonAlert-200"
                    >
                      <Trash2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default MedicationScheduleManager;
