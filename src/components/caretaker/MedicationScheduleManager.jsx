import React, { useState } from 'react';
import { Plus, Edit2, Trash2, Pill, Check, X, Clock, AlertTriangle } from 'lucide-react';

export const MedicationScheduleManager = ({
  medications = [],
  onAddMedication,
  onUpdateMedication,
  onDeleteMedication,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    dosage: '',
    scheduleTime: '08:00',
    status: 'pending',
    instructions: '',
  });

  const resetForm = () => {
    setFormData({
      name: '',
      dosage: '',
      scheduleTime: '08:00',
      status: 'pending',
      instructions: '',
    });
    setEditingId(null);
    setIsAdding(false);
    setValidationError('');
  };

  const handleStartEdit = (med) => {
    setFormData({
      name: med.name || '',
      dosage: med.dosage || '',
      scheduleTime: med.scheduleTime || '08:00',
      status: med.status || 'pending',
      instructions: med.instructions || '',
    });
    setEditingId(med.id);
    setIsAdding(true);
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      setValidationError('Medication name is required.');
      return;
    }
    if (!formData.dosage.trim()) {
      setValidationError('Dosage is required (e.g. 10mg, 1 tablet).');
      return;
    }
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(formData.scheduleTime)) {
      setValidationError('Schedule time must be in HH:MM format (e.g. 08:30 or 20:00).');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await onUpdateMedication(editingId, formData);
      } else {
        await onAddMedication(formData);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to submit medication:', err);
      setValidationError('Failed to save to Firestore. Please try again.');
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-elderBlue-950">Medication Schedules</h3>
          <p className="text-lg text-elderBlue-700 font-medium mt-0.5">
            Configure prescribed medicines, dosage timings, and administration instructions.
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

      {/* Add / Edit Form Panel */}
      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="bg-warmWhite-paper border-3 border-elderBlue-300 rounded-3xl p-6 sm:p-8 shadow-xl space-y-6"
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="med-name" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Medication Name *
              </label>
              <input
                id="med-name"
                type="text"
                required
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g. Lisinopril, Metformin"
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="med-dosage" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Dosage / Quantity *
              </label>
              <input
                id="med-dosage"
                type="text"
                required
                value={formData.dosage}
                onChange={(e) => setFormData({ ...formData, dosage: e.target.value })}
                placeholder="e.g. 10mg, 1 tablet"
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="med-time" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Schedule Time (HH:MM) *
              </label>
              <input
                id="med-time"
                type="time"
                required
                value={formData.scheduleTime}
                onChange={(e) => setFormData({ ...formData, scheduleTime: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <label htmlFor="med-status" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Initial Dose Status
              </label>
              <select
                id="med-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              >
                <option value="pending">Pending</option>
                <option value="confirmed">Confirmed Taken</option>
                <option value="missed">Missed</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label htmlFor="med-instructions" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Administration Instructions (Spoken to Senior)
              </label>
              <input
                id="med-instructions"
                type="text"
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                placeholder="e.g. Take with breakfast and a tall glass of water."
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 pt-4 border-t-2 border-elderBlue-200">
            <button
              type="button"
              onClick={resetForm}
              className="min-h-[60px] px-6 py-3 rounded-2xl border-2 border-elderBlue-300 text-elderBlue-900 font-bold text-xl hover:bg-elderBlue-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="min-h-[60px] px-8 py-3 rounded-2xl bg-emeraldSuccess-700 hover:bg-emeraldSuccess-800 text-white font-bold text-xl flex items-center gap-2 shadow-md focus:ring-4 focus:ring-emeraldSuccess-300"
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
        {medications.map((med) => (
          <div
            key={med.id}
            className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 shadow-sm flex flex-col justify-between hover:border-elderBlue-300 transition-colors"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-elderBlue-100 text-elderBlue-900 rounded-2xl">
                    <Pill className="w-7 h-7 stroke-[2.5]" aria-hidden="true" />
                  </div>
                  <div>
                    <h4 className="text-2xl font-bold text-elderBlue-950">{med.name}</h4>
                    <span className="text-xl font-bold text-elderBlue-700">{med.dosage}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 px-3 py-1 bg-elderBlue-50 border border-elderBlue-200 rounded-xl text-lg font-bold text-elderBlue-900">
                  <Clock className="w-5 h-5 text-elderBlue-700" aria-hidden="true" />
                  <span>{med.scheduleTime}</span>
                </div>
              </div>

              {med.instructions && (
                <p className="mt-3 text-lg text-elderBlue-800 font-medium bg-warmWhite-paper p-3 rounded-xl border border-elderBlue-100">
                  {med.instructions}
                </p>
              )}
            </div>

            <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t-2 border-elderBlue-50">
              <span className="text-base font-bold text-elderBlue-600 uppercase tracking-wide">
                Status: <strong className="text-elderBlue-950">{med.status}</strong>
              </span>

              <div className="flex items-center gap-2">
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
        ))}
      </div>
    </div>
  );
};

export default MedicationScheduleManager;

