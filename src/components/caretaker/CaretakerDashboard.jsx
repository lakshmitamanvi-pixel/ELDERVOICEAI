import React, { useState, useEffect } from 'react';
import {
  Activity,
  Pill,
  Calendar,
  Brain,
  Wifi,
  WifiOff,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react';
import PinAuthWrapper from './PinAuthWrapper.jsx';
import AdherenceTracker from './AdherenceTracker.jsx';
import MedicationScheduleManager from './MedicationScheduleManager.jsx';
import AppointmentManager from './AppointmentManager.jsx';
import MemoryVaultManager from './MemoryVaultManager.jsx';
import {
  subscribeToProfile,
  saveProfileData,
  subscribeToMedications,
  addMedication,
  updateMedication,
  deleteMedication,
  logMedicationDoseStatus,
  refillMedicationStock,
  subscribeToAppointments,
  addAppointment,
  updateAppointment,
  deleteAppointment,
} from '../../services/caretakerService.js';
import { buildRestockAlerts } from '../../utils/medicinePrediction.js';

export const CaretakerDashboard = ({ onProfileUpdated }) => {
  const [activeTab, setActiveTab] = useState('adherence');
  const [profile, setProfile] = useState(null);
  const [medications, setMedications] = useState([]);
  const [appointments, setAppointments] = useState([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isLiveFirestore, setIsLiveFirestore] = useState(false);
  const [notification, setNotification] = useState(null);

  const showNotification = (message, type = 'success') => {
    setNotification({ message, type });
    setTimeout(() => setNotification(null), 4000);
  };

  useEffect(() => {
    setIsLoading(true);

    const unsubProfile = subscribeToProfile((data, isLive) => {
      setProfile(data);
      if (isLive) setIsLiveFirestore(true);
    });

    const unsubMeds = subscribeToMedications((data, isLive) => {
      setMedications(data);
      if (isLive) setIsLiveFirestore(true);
      setIsLoading(false);
    });

    const unsubApts = subscribeToAppointments((data, isLive) => {
      setAppointments(data);
      if (isLive) setIsLiveFirestore(true);
    });

    return () => {
      unsubProfile();
      unsubMeds();
      unsubApts();
    };
  }, []);

  const handleUpdateMedicationStatus = async (id, status) => {
    try {
      const targetMed = medications.find((m) => m.id === id);
      if (targetMed) {
        await logMedicationDoseStatus(targetMed, status);
      } else {
        await updateMedication(id, { status, updatedAt: new Date().toISOString() });
      }
      showNotification(`Updated dose status to ${status}.`);
    } catch (err) {
      console.error('Failed to update dose status:', err);
      showNotification('Failed to update dose status.', 'error');
    }
  };

  const handleRefillMedication = async (med, addedUnits) => {
    try {
      await refillMedicationStock(med, addedUnits);
      showNotification(`Added ${addedUnits} ${med.unit || 'unit'}(s) to ${med.name} stock.`);
    } catch (err) {
      console.error('Failed to refill medication:', err);
      showNotification(err.message || 'Error refilling medication.', 'error');
    }
  };

  const handleAddMedication = async (medData) => {
    try {
      await addMedication(medData);
      showNotification(`Scheduled ${medData.name} successfully.`);
    } catch (err) {
      console.error('Failed to schedule medication:', err);
      showNotification('Error scheduling medication.', 'error');
      throw err;
    }
  };

  const handleUpdateMedication = async (id, updates) => {
    try {
      await updateMedication(id, updates);
      showNotification(`Updated ${updates.name || 'medication'}.`);
    } catch (err) {
      console.error('Failed to update medication:', err);
      showNotification('Error updating medication.', 'error');
      throw err;
    }
  };

  const handleDeleteMedication = async (id) => {
    try {
      await deleteMedication(id);
      showNotification('Medication removed.');
    } catch (err) {
      console.error('Failed to delete medication:', err);
      showNotification('Error deleting medication.', 'error');
      throw err;
    }
  };

  const handleAddAppointment = async (aptData) => {
    try {
      await addAppointment(aptData);
      showNotification(`Booked visit with ${aptData.doctorName}.`);
    } catch (err) {
      console.error('Failed to add appointment:', err);
      showNotification('Error booking appointment.', 'error');
      throw err;
    }
  };

  const handleUpdateAppointment = async (id, updates) => {
    try {
      await updateAppointment(id, updates);
      showNotification(`Updated visit with ${updates.doctorName || 'doctor'}.`);
    } catch (err) {
      console.error('Failed to update appointment:', err);
      showNotification('Error updating appointment.', 'error');
      throw err;
    }
  };

  const handleDeleteAppointment = async (id) => {
    try {
      await deleteAppointment(id);
      showNotification('Appointment removed.');
    } catch (err) {
      console.error('Failed to delete appointment:', err);
      showNotification('Error removing appointment.', 'error');
      throw err;
    }
  };

  const handleSaveProfile = async (profileData) => {
    try {
      const result = await saveProfileData(profileData);
      setProfile(profileData);
      if (onProfileUpdated) onProfileUpdated(profileData);
      showNotification(
        result.live
          ? 'Profile & Memory Vault synchronized to live Firestore.'
          : 'Profile & Memory Vault saved locally.'
      );
    } catch (err) {
      console.error('Failed to save profile:', err);
      showNotification('Error saving profile.', 'error');
      throw err;
    }
  };

  return (
    <PinAuthWrapper>
      {({ onSignOut }) => (
        <div className="space-y-6">
          <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                <span className="text-sm sm:text-base font-bold text-elderBlue-600 uppercase tracking-wider">
                  Care Management Console
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm sm:text-base font-bold ${
                    isLiveFirestore
                      ? 'bg-emeraldSuccess-100 text-emeraldSuccess-900 border border-emeraldSuccess-400'
                      : 'bg-elderBlue-100 text-elderBlue-900 border border-elderBlue-300'
                  }`}
                >
                  {isLiveFirestore ? (
                    <>
                      <Wifi className="w-4 h-4 stroke-[2.5] text-emeraldSuccess-700 flex-shrink-0" aria-hidden="true" />
                      <span>Firestore Sync Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 stroke-[2.5] text-elderBlue-700 flex-shrink-0" aria-hidden="true" />
                      <span>Local Persistence Mode</span>
                    </>
                  )}
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-elderBlue-950 mt-1 break-words">
                {profile?.fullName || 'Senior User'}’s Caretaker Dashboard
              </h2>
            </div>

            <div className="flex items-center gap-3 min-w-0">
              <span className="text-base sm:text-lg font-bold text-elderBlue-800 bg-warmWhite-paper px-4 py-2 rounded-xl border border-elderBlue-200 break-words">
                Primary: {profile?.emergencyContacts?.[0]?.name || 'Sarah Vance'}
              </span>
            </div>
          </div>

          {notification && (
            <div
              className={`p-4 rounded-2xl border-2 font-bold text-lg flex items-center justify-between gap-3 shadow-md transition-all ${
                notification.type === 'error'
                  ? 'bg-crimsonAlert-50 border-crimsonAlert-300 text-crimsonAlert-950'
                  : 'bg-emeraldSuccess-50 border-emeraldSuccess-300 text-emeraldSuccess-950'
              }`}
            >
              <div className="flex items-center gap-2">
                {notification.type === 'error' ? (
                  <AlertCircle className="w-6 h-6 text-crimsonAlert-700 stroke-[2.5]" aria-hidden="true" />
                ) : (
                  <CheckCircle2 className="w-6 h-6 text-emeraldSuccess-700 stroke-[2.5]" aria-hidden="true" />
                )}
                <span>{notification.message}</span>
              </div>
              <button
                onClick={() => setNotification(null)}
                className="text-base underline hover:no-underline"
              >
                Dismiss
              </button>
            </div>
          )}

          {(() => {
            const restockAlerts = buildRestockAlerts(medications);
            if (restockAlerts.length === 0) return null;
            return (
              <div
                role="region"
                aria-label="Medicine Restock Reminders"
                className="bg-amber-50 border-3 border-amber-300 rounded-3xl p-4 sm:p-5 shadow-sm space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-lg sm:text-xl font-extrabold text-amber-950 flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-amber-700 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
                    <span>Restock Reminders ({restockAlerts.length})</span>
                  </h3>
                  <span className="text-sm font-bold text-amber-800">Asia/Kolkata</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {restockAlerts.map((alert) => {
                    const med = medications.find((m) => m.id === alert.medicineId);
                    const refillAmount = med?.pack_size || 10;
                    return (
                      <div
                        key={alert.id}
                        className={`p-3.5 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          alert.severity === 'critical'
                            ? 'bg-crimsonAlert-50 border-crimsonAlert-300 text-crimsonAlert-950'
                            : 'bg-white border-amber-300 text-elderBlue-950'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="font-bold text-base sm:text-lg">{alert.title}</p>
                          <p className="text-sm sm:text-base font-medium opacity-90">{alert.message}</p>
                        </div>
                        {med && (
                          <button
                            type="button"
                            onClick={() => handleRefillMedication(med, refillAmount)}
                            className="min-h-[44px] px-4 py-2 rounded-xl bg-elderBlue-900 hover:bg-elderBlue-950 text-white font-bold text-sm sm:text-base flex-shrink-0"
                          >
                            + Refill {refillAmount}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <nav
            aria-label="Caretaker Sections"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 bg-warmWhite-paper p-2 rounded-3xl border-3 border-elderBlue-200"
          >
            <button
              type="button"
              onClick={() => setActiveTab('adherence')}
              className={`min-h-[56px] min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-base sm:text-xl flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'adherence'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Activity className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Live Adherence</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('medications')}
              className={`min-h-[56px] min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-base sm:text-xl flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'medications'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Pill className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Medications</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('appointments')}
              className={`min-h-[56px] min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-base sm:text-xl flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'appointments'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Calendar className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Appointments</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('vault')}
              className={`min-h-[56px] min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 rounded-2xl font-bold text-base sm:text-xl flex items-center justify-center gap-2 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'vault'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Brain className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Manage Memories</span>
            </button>
          </nav>

          {isLoading ? (
            <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-12 text-center shadow-sm">
              <RefreshCw className="w-12 h-12 text-elderBlue-600 animate-spin mx-auto mb-4" />
              <p className="text-2xl font-bold text-elderBlue-950">
                Synchronizing with Firestore Database...
              </p>
              <p className="text-lg text-elderBlue-700 mt-1">
                Loading medical profiles, schedules, and active visits.
              </p>
            </div>
          ) : (
            <main>
              {activeTab === 'adherence' && (
                <AdherenceTracker
                  medications={medications}
                  onUpdateStatus={handleUpdateMedicationStatus}
                />
              )}

              {activeTab === 'medications' && (
                <MedicationScheduleManager
                  medications={medications}
                  onAddMedication={handleAddMedication}
                  onUpdateMedication={handleUpdateMedication}
                  onDeleteMedication={handleDeleteMedication}
                  onRefillMedication={handleRefillMedication}
                />
              )}

              {activeTab === 'appointments' && (
                <AppointmentManager
                  appointments={appointments}
                  onAddAppointment={handleAddAppointment}
                  onUpdateAppointment={handleUpdateAppointment}
                  onDeleteAppointment={handleDeleteAppointment}
                />
              )}

              {activeTab === 'vault' && (
                <MemoryVaultManager
                  profile={profile || {}}
                  onSaveProfile={handleSaveProfile}
                />
              )}
            </main>
          )}
        </div>
      )}
    </PinAuthWrapper>
  );
};

export default CaretakerDashboard;
