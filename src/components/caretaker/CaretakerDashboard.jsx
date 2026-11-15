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
  subscribeToAppointments,
  addAppointment,
  updateAppointment,
  deleteAppointment,
} from '../../services/caretakerService.js';

export const CaretakerDashboard = () => {
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
      await updateMedication(id, { status, updatedAt: new Date().toISOString() });
      showNotification(`Updated dose status to ${status}.`);
    } catch (err) {
      console.error('Failed to update dose status:', err);
      showNotification('Failed to update dose status.', 'error');
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
          <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <span className="text-base font-bold text-elderBlue-600 uppercase tracking-wider">
                  Care Management Console
                </span>
                <span
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-base font-bold ${
                    isLiveFirestore
                      ? 'bg-emeraldSuccess-100 text-emeraldSuccess-900 border border-emeraldSuccess-400'
                      : 'bg-elderBlue-100 text-elderBlue-900 border border-elderBlue-300'
                  }`}
                >
                  {isLiveFirestore ? (
                    <>
                      <Wifi className="w-4 h-4 stroke-[2.5] text-emeraldSuccess-700" aria-hidden="true" />
                      <span>Firestore Sync Live</span>
                    </>
                  ) : (
                    <>
                      <WifiOff className="w-4 h-4 stroke-[2.5] text-elderBlue-700" aria-hidden="true" />
                      <span>Local Persistence Mode</span>
                    </>
                  )}
                </span>
              </div>
              <h2 className="text-3xl font-extrabold text-elderBlue-950 mt-1">
                {profile?.fullName || 'Senior User'}’s Caretaker Dashboard
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <span className="text-lg font-bold text-elderBlue-800 bg-warmWhite-paper px-4 py-2 rounded-xl border border-elderBlue-200">
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

          <nav
            aria-label="Caretaker Sections"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 bg-warmWhite-paper p-2 rounded-3xl border-3 border-elderBlue-200"
          >
            <button
              onClick={() => setActiveTab('adherence')}
              className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-lg sm:text-xl flex items-center justify-center gap-2.5 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'adherence'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Activity className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
              <span>Live Adherence</span>
            </button>

            <button
              onClick={() => setActiveTab('medications')}
              className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-lg sm:text-xl flex items-center justify-center gap-2.5 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'medications'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Pill className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
              <span>Medications</span>
            </button>

            <button
              onClick={() => setActiveTab('appointments')}
              className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-lg sm:text-xl flex items-center justify-center gap-2.5 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'appointments'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Calendar className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
              <span>Appointments</span>
            </button>

            <button
              onClick={() => setActiveTab('vault')}
              className={`min-h-[60px] px-4 py-3 rounded-2xl font-bold text-lg sm:text-xl flex items-center justify-center gap-2.5 transition-all focus:outline-none focus:ring-4 ${
                activeTab === 'vault'
                  ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                  : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
              }`}
            >
              <Brain className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
              <span>Memory Vault</span>
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
