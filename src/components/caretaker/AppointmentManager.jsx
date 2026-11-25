import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  MapPin,
  Stethoscope,
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  AlertTriangle,
  UserCheck,
} from 'lucide-react';
import { formatSeniorDate, formatSeniorTime } from '../../utils/formatters.js';

export const AppointmentManager = ({
  appointments = [],
  onAddAppointment,
  onUpdateAppointment,
  onDeleteAppointment,
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationError, setValidationError] = useState('');

  const [formData, setFormData] = useState({
    doctorName: '',
    specialty: '',
    timestamp: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16),
    location: '',
    notes: '',
    status: 'upcoming',
  });

  const resetForm = () => {
    setFormData({
      doctorName: '',
      specialty: '',
      timestamp: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 16),
      location: '',
      notes: '',
      status: 'upcoming',
    });
    setEditingId(null);
    setIsAdding(false);
    setValidationError('');
  };

  const handleStartEdit = (apt) => {
    let formattedDate = '';
    try {
      formattedDate = new Date(apt.timestamp).toISOString().slice(0, 16);
    } catch {
      formattedDate = new Date().toISOString().slice(0, 16);
    }

    setFormData({
      doctorName: apt.doctorName || '',
      specialty: apt.specialty || '',
      timestamp: formattedDate,
      location: apt.location || '',
      notes: apt.notes || '',
      status: apt.status || 'upcoming',
    });
    setEditingId(apt.id);
    setIsAdding(true);
    setValidationError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.doctorName.trim()) {
      setValidationError('Physician / Specialist name is required.');
      return;
    }
    if (!formData.specialty.trim()) {
      setValidationError('Medical specialty is required (e.g. Cardiology, Optometry).');
      return;
    }
    if (!formData.timestamp) {
      setValidationError('Appointment date & time are required.');
      return;
    }

    setIsSubmitting(true);
    try {
      const isoTimestamp = new Date(formData.timestamp).toISOString();
      const payload = {
        ...formData,
        timestamp: isoTimestamp,
      };

      if (editingId) {
        await onUpdateAppointment(editingId, payload);
      } else {
        await onAddAppointment(payload);
      }
      resetForm();
    } catch (err) {
      console.error('Failed to submit appointment:', err);
      setValidationError('Failed to save appointment to Firestore.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    setIsSubmitting(true);
    try {
      await onDeleteAppointment(id);
      setDeletingId(null);
    } catch (err) {
      console.error('Failed to delete appointment:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-elderBlue-950">Doctor Appointments & Care Visits</h3>
          <p className="text-lg text-elderBlue-700 font-medium mt-0.5">
            Maintain consultations, specialist visits, and clinic locations.
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
            <span>Add Appointment</span>
          </button>
        )}
      </div>

      {/* Add / Edit Form Panel */}
      {isAdding && (
        <form
          onSubmit={handleSubmit}
          className="bg-warmWhite-paper border-3 border-elderBlue-300 rounded-3xl p-4 sm:p-8 shadow-xl space-y-6"
        >
          <div className="flex items-center justify-between pb-4 border-b-2 border-elderBlue-200">
            <h4 className="text-2xl font-bold text-elderBlue-950">
              {editingId ? 'Edit Doctor Appointment' : 'Schedule New Doctor Appointment'}
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
              <label htmlFor="apt-doctor" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Physician Name *
              </label>
              <input
                id="apt-doctor"
                type="text"
                required
                value={formData.doctorName}
                onChange={(e) => setFormData({ ...formData, doctorName: e.target.value })}
                placeholder="e.g. Dr. Robert Chen"
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="apt-specialty" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Specialty *
              </label>
              <input
                id="apt-specialty"
                type="text"
                required
                value={formData.specialty}
                onChange={(e) => setFormData({ ...formData, specialty: e.target.value })}
                placeholder="e.g. Cardiology, Audiology"
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="apt-datetime" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Date & Time (ISO) *
              </label>
              <input
                id="apt-datetime"
                type="datetime-local"
                required
                value={formData.timestamp}
                onChange={(e) => setFormData({ ...formData, timestamp: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label htmlFor="apt-location" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Clinic / Hospital Address
              </label>
              <input
                id="apt-location"
                type="text"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                placeholder="e.g. St. Jude Health Pavilion, Suite 305"
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              />
            </div>

            <div>
              <label htmlFor="apt-status" className="block text-xl font-bold text-elderBlue-900 mb-2">
                Status
              </label>
              <select
                id="apt-status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                className="w-full min-h-[60px] px-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
              >
                <option value="upcoming">Upcoming</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="apt-notes" className="block text-xl font-bold text-elderBlue-900 mb-2">
              Appointment Notes & Preparations
            </label>
            <textarea
              id="apt-notes"
              rows={3}
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              placeholder="e.g. Fasting required after midnight; bring current medication list."
              className="w-full p-4 text-xl font-semibold bg-white border-3 border-elderBlue-200 rounded-2xl text-elderBlue-950 focus:ring-4 focus:ring-elderBlue-300 focus:outline-none"
            />
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
                  <span>{editingId ? 'Update Appointment' : 'Save Appointment'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* Appointment Cards List */}
      <div className="space-y-4">
        {appointments.map((apt) => {
          const aptDate = new Date(apt.timestamp);
          const isPast = aptDate.getTime() < Date.now();

          return (
            <div
              key={apt.id}
              className="bg-white border-3 border-elderBlue-100 rounded-3xl p-4 sm:p-6 shadow-sm hover:border-elderBlue-300 transition-colors min-w-0"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 min-w-0">
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="p-3 sm:p-4 bg-elderBlue-100 text-elderBlue-900 rounded-2xl flex-shrink-0">
                    <Stethoscope className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <h4 className="text-xl sm:text-2xl font-bold text-elderBlue-950 break-words">{apt.doctorName}</h4>
                      <span className="px-3 py-1 bg-elderBlue-50 border border-elderBlue-200 text-elderBlue-800 font-bold text-lg rounded-xl">
                        {apt.specialty}
                      </span>
                      <span
                        className={`px-3 py-1 text-base font-bold rounded-full ${
                          apt.status === 'completed'
                            ? 'bg-emeraldSuccess-100 text-emeraldSuccess-900'
                            : isPast
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-elderBlue-800 text-white'
                        }`}
                      >
                        {apt.status === 'completed' ? 'Completed' : isPast ? 'Past Date' : 'Upcoming'}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-4 mt-2 text-elderBlue-800 text-lg font-medium">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-5 h-5 text-elderBlue-700" aria-hidden="true" />
                        <span>{formatSeniorDate(aptDate)}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-5 h-5 text-elderBlue-700" aria-hidden="true" />
                        <span>{formatSeniorTime(aptDate)}</span>
                      </div>
                      {apt.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-5 h-5 text-elderBlue-700" aria-hidden="true" />
                          <span>{apt.location}</span>
                        </div>
                      )}
                    </div>

                    {apt.notes && (
                      <p className="mt-2 text-lg text-elderBlue-900 bg-warmWhite-paper p-3 rounded-xl border border-elderBlue-100">
                        {apt.notes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end lg:self-center">
                  <button
                    onClick={() => handleStartEdit(apt)}
                    aria-label={`Edit appointment with ${apt.doctorName}`}
                    className="min-h-[48px] px-4 py-2 rounded-xl bg-elderBlue-50 text-elderBlue-900 hover:bg-elderBlue-100 font-bold text-base flex items-center gap-1.5 border border-elderBlue-200"
                  >
                    <Edit2 className="w-5 h-5" aria-hidden="true" />
                    <span>Edit</span>
                  </button>

                  {deletingId === apt.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDelete(apt.id)}
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
                      onClick={() => setDeletingId(apt.id)}
                      aria-label={`Delete appointment with ${apt.doctorName}`}
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

export default AppointmentManager;

