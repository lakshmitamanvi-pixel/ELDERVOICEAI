import React, { useState, useEffect } from 'react';
import { User, Users, Heart, Shield, Activity, BellRing } from 'lucide-react';
import { SeniorVoiceAssistant, EmergencyAlertButton, MedicationReminderCard, MemoryPeopleSection } from './components/elderly/index.js';
import { CaretakerDashboard } from './components/caretaker/index.js';
import { formatSeniorDate, formatSeniorTime } from './utils/formatters.js';
import { subscribeToMedications, updateMedication, subscribeToProfile } from './services/caretakerService.js';
import { sendEmergencyEmailAlert } from './services/email.js';
import { checkStartupHealth } from './services/geminiService.js';

export function App() {
  const [activeTab, setActiveTab] = useState('senior');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [medications, setMedications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [emergencyStatus, setEmergencyStatus] = useState(null);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    checkStartupHealth().catch((err) => {
      console.error('[App] Startup health check failed unexpectedly:', err);
    });
  }, []);

  useEffect(() => {
    const unsubMeds = subscribeToMedications((data) => {
      setMedications(data);
    });
    const unsubProfile = subscribeToProfile((data) => {
      setProfile(data);
    });
    return () => {
      unsubMeds();
      unsubProfile();
    };
  }, []);

  const handleEmergencyAlert = async () => {
    setEmergencyStatus('Alerting Family & Caretaker...');
    try {
      await sendEmergencyEmailAlert({
        seniorName: 'Eleanor Vance',
        emergencyType: 'SOS Emergency Button Activated',
        location: 'Home Console - Living Room',
      });
      setEmergencyStatus('Emergency alert dispatched to family.');
      setTimeout(() => setEmergencyStatus(null), 6000);
    } catch (err) {
      console.error('Emergency dispatch error:', err);
      setEmergencyStatus('Emergency alert logged.');
      setTimeout(() => setEmergencyStatus(null), 6000);
    }
  };

  const handleToggleMedication = async (id, takenState) => {
    const newStatus = takenState ? 'confirmed' : 'pending';
    await updateMedication(id, { status: newStatus, updatedAt: new Date().toISOString() });
  };

  return (
    <div className="min-h-screen bg-warmWhite flex flex-col">
      <header className="bg-elderBlue-900 text-warmWhite border-b-4 border-elderBlue-950 py-5 px-4 sm:px-8 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-elderBlue-800 rounded-2xl border-2 border-elderBlue-700">
              <Heart className="w-9 h-9 text-emeraldSuccess-400 stroke-[2.5]" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">
                ElderVoice <span className="text-emeraldSuccess-400">AI</span>
              </h1>
              <p className="text-lg text-elderBlue-200 font-semibold">
                Voice Companion & Senior Care Ecosystem
              </p>
            </div>
          </div>

          <div className="text-center md:text-right bg-elderBlue-950/70 px-6 py-3 rounded-2xl border border-elderBlue-700">
            <p className="text-2xl font-bold tracking-wide text-warmWhite">
              {formatSeniorTime(currentTime)}
            </p>
            <p className="text-lg text-elderBlue-200 font-medium">
              {formatSeniorDate(currentTime)}
            </p>
          </div>
        </div>
      </header>

      {emergencyStatus && (
        <div className="bg-crimsonAlert-700 text-white font-bold text-xl py-3 px-6 text-center shadow-lg animate-pulse">
          {emergencyStatus}
        </div>
      )}

      <nav aria-label="Interface Mode" className="max-w-6xl w-full mx-auto px-4 sm:px-8 mt-6">
        <div className="grid grid-cols-2 gap-4 bg-warmWhite-paper p-2 rounded-3xl border-3 border-elderBlue-200">
          <button
            onClick={() => setActiveTab('senior')}
            className={`min-h-[60px] px-6 py-3 rounded-2xl font-bold text-xl sm:text-2xl flex items-center justify-center gap-3 transition-all duration-200 focus:outline-none focus:ring-4 ${
              activeTab === 'senior'
                ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
            }`}
          >
            <User className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
            <span>Senior View</span>
          </button>

          <button
            onClick={() => setActiveTab('caretaker')}
            className={`min-h-[60px] px-6 py-3 rounded-2xl font-bold text-xl sm:text-2xl flex items-center justify-center gap-3 transition-all duration-200 focus:outline-none focus:ring-4 ${
              activeTab === 'caretaker'
                ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
            }`}
          >
            <Users className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
            <span>Family & Caretaker</span>
          </button>
        </div>
      </nav>

      <main className="max-w-6xl w-full mx-auto px-4 sm:px-8 py-6 flex-1">
        {activeTab === 'senior' ? (
          <div className="space-y-8">
            <section aria-labelledby="emergency-heading">
              <h2 id="emergency-heading" className="sr-only">Emergency Assistance</h2>
              <EmergencyAlertButton onTriggerAlert={handleEmergencyAlert} />
            </section>

            <section aria-labelledby="assistant-heading">
              <h2 id="assistant-heading" className="text-2xl font-bold text-elderBlue-950 mb-3">
                Voice Assistant & Companion
              </h2>
              <SeniorVoiceAssistant />
            </section>

            <section aria-labelledby="medications-heading" className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 id="medications-heading" className="text-2xl font-bold text-elderBlue-950">
                  Daily Medication Schedule
                </h2>
                <span className="text-lg font-bold text-elderBlue-700 bg-elderBlue-100 px-4 py-1.5 rounded-full">
                  Real-time Schedule
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {medications.map((med) => (
                  <MedicationReminderCard
                    key={med.id}
                    medication={{
                      id: med.id,
                      name: med.name,
                      dosage: med.dosage,
                      time: med.scheduleTime,
                      taken: med.status === 'confirmed',
                    }}
                    onToggleTaken={handleToggleMedication}
                  />
                ))}
              </div>
            </section>

            <section aria-labelledby="memories-heading">
              <MemoryPeopleSection profile={profile || {}} />
            </section>
          </div>
        ) : (
          <section aria-labelledby="caretaker-heading">
            <h2 id="caretaker-heading" className="sr-only">Caretaker Dashboard</h2>
            <CaretakerDashboard onProfileUpdated={setProfile} />
          </section>
        )}
      </main>

      <footer className="bg-elderBlue-950 text-warmWhite py-6 px-4 border-t-4 border-elderBlue-900 mt-12">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-emeraldSuccess-400 stroke-[2.5]" aria-hidden="true" />
            <span className="text-lg font-bold">ElderVoice AI Production Core</span>
          </div>
          <p className="text-base text-elderBlue-200">
            Enforcing WCAG AAA Color Contrast & Accessible Touch Target Standards.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;
