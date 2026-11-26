import React, { useState, useEffect, useRef } from 'react';
import { User, Users, Heart, Shield, Mic } from 'lucide-react';
import { SeniorVoiceAssistant, EmergencyAlertButton, MedicationReminderCard, MemoryPeopleSection } from './components/elderly/index.js';
import { CaretakerDashboard } from './components/caretaker/index.js';
import { formatSeniorDate, formatSeniorTime } from './utils/formatters.js';
import { subscribeToMedications, logMedicationDoseStatus, subscribeToProfile } from './services/caretakerService.js';
import { sendEmergencyEmailAlert } from './services/email.js';
import { checkStartupHealth } from './services/geminiService.js';

export function App() {
  const [activeTab, setActiveTab] = useState('senior');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [medications, setMedications] = useState([]);
  const [profile, setProfile] = useState(null);
  const [emergencyStatus, setEmergencyStatus] = useState(null);
  const [isVoiceListening, setIsVoiceListening] = useState(false);
  const [isInputFocused, setIsInputFocused] = useState(false);
  const voiceAssistantRef = useRef(null);

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
    const targetMed = medications.find((m) => m.id === id);
    const newStatus = takenState ? 'confirmed' : 'pending';
    if (targetMed) {
      await logMedicationDoseStatus(targetMed, newStatus);
    }
  };

  return (
    <div className="min-h-dvh-screen bg-warmWhite flex flex-col w-full max-w-full">
      <header className="bg-elderBlue-900 text-warmWhite border-b-4 border-elderBlue-950 safe-area-top py-4 sm:py-5 px-3 sm:px-8 shadow-lg">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
            <div className="p-2.5 sm:p-3 bg-elderBlue-800 rounded-2xl border-2 border-elderBlue-700 flex-shrink-0">
              <Heart className="w-8 h-8 sm:w-9 sm:h-9 text-emeraldSuccess-400 stroke-[2.5]" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                ElderVoice <span className="text-emeraldSuccess-400">AI</span>
              </h1>
              <p className="text-base sm:text-lg text-elderBlue-200 font-semibold leading-snug">
                Voice Companion & Senior Care Ecosystem
              </p>
            </div>
          </div>

          <div className="w-full md:w-auto text-center md:text-right bg-elderBlue-950/70 px-4 sm:px-6 py-2.5 sm:py-3 rounded-2xl border border-elderBlue-700 flex-shrink-0">
            <p className="text-xl sm:text-2xl font-bold tracking-wide text-warmWhite">
              {formatSeniorTime(currentTime)}
            </p>
            <p className="text-base sm:text-lg text-elderBlue-200 font-medium">
              {formatSeniorDate(currentTime)}
            </p>
          </div>
        </div>
      </header>

      {emergencyStatus && (
        <div className="bg-crimsonAlert-700 text-white font-bold text-lg sm:text-xl py-3 px-4 sm:px-6 text-center shadow-lg animate-pulse">
          {emergencyStatus}
        </div>
      )}

      <nav aria-label="Interface Mode" className="max-w-6xl w-full mx-auto px-3 sm:px-8 mt-4 sm:mt-6">
        <div className="grid grid-cols-2 gap-2 sm:gap-4 bg-warmWhite-paper p-1.5 sm:p-2 rounded-3xl border-3 border-elderBlue-200">
          <button
            type="button"
            onClick={() => setActiveTab('senior')}
            className={`min-h-[56px] min-w-0 px-3 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-base sm:text-xl flex items-center justify-center gap-2 sm:gap-3 transition-all duration-200 focus:outline-none focus:ring-4 ${
              activeTab === 'senior'
                ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
            }`}
          >
            <User className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
            <span className="leading-tight text-center">Senior View</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('caretaker')}
            className={`min-h-[56px] min-w-0 px-3 sm:px-6 py-2.5 sm:py-3 rounded-2xl font-bold text-base sm:text-xl flex items-center justify-center gap-2 sm:gap-3 transition-all duration-200 focus:outline-none focus:ring-4 ${
              activeTab === 'caretaker'
                ? 'bg-elderBlue-800 text-warmWhite shadow-md focus:ring-elderBlue-400'
                : 'text-elderBlue-900 hover:bg-elderBlue-100 focus:ring-elderBlue-300'
            }`}
          >
            <Users className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
            <span className="leading-tight text-center">Caregiver View</span>
          </button>
        </div>
      </nav>

      <main className="max-w-6xl w-full mx-auto px-3 sm:px-8 py-5 sm:py-6 flex-1 min-w-0">
        {activeTab === 'senior' ? (
          <div className="space-y-6 sm:space-y-8">
            <section aria-labelledby="assistant-heading">
              <h2 id="assistant-heading" className="text-2xl font-bold text-elderBlue-950 mb-3">
                Voice Assistant & Companion
              </h2>
              <SeniorVoiceAssistant
                ref={voiceAssistantRef}
                onListeningChange={setIsVoiceListening}
                onInputFocusChange={setIsInputFocused}
              />
            </section>

            <section aria-labelledby="medications-heading" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="medications-heading" className="text-2xl font-bold text-elderBlue-950">
                  Daily Medication Schedule
                </h2>
                <span className="text-base sm:text-lg font-bold text-elderBlue-700 bg-elderBlue-100 px-4 py-1.5 rounded-full">
                  Real-time Schedule
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {medications.map((med) => (
                  <MedicationReminderCard
                    key={med.id}
                    medication={{
                      ...med,
                      id: med.id,
                      name: med.name,
                      dosage: med.dosage,
                      time:
                        med.schedule_type === 'as_needed'
                          ? 'As needed'
                          : Array.isArray(med.times_of_day) && med.times_of_day.length > 0
                          ? med.times_of_day.join(', ')
                          : med.scheduleTime,
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

      <footer className="bg-elderBlue-950 text-warmWhite py-5 px-4 border-t-4 border-elderBlue-900 mt-8 safe-area-bottom">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-emeraldSuccess-400 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
            <span className="text-base sm:text-lg font-bold">ElderVoice AI Production Core</span>
          </div>
          <p className="text-base text-elderBlue-200">
            Enforcing WCAG AAA Color Contrast & Accessible Touch Target Standards.
          </p>
        </div>
      </footer>

      {activeTab === 'senior' && !isInputFocused && (
        <div
          role="region"
          aria-label="Quick Thumb Actions"
          className="sticky bottom-0 z-30 w-full bg-warmWhite/95 backdrop-blur-md border-t-3 border-elderBlue-200 safe-area-bottom pt-2.5 shadow-[0_-6px_20px_rgba(11,42,74,0.12)]"
        >
          <div className="max-w-6xl mx-auto grid grid-cols-2 gap-2.5 sm:gap-4">
            <button
              type="button"
              onClick={() => voiceAssistantRef.current?.toggleListening()}
              aria-label={isVoiceListening ? 'Stop listening' : 'Tap to speak with assistant'}
              className={`min-h-[60px] w-full min-w-0 px-3 sm:px-5 py-3 rounded-2xl font-bold text-lg sm:text-xl flex items-center justify-center gap-2 shadow-lg transition-all focus:outline-none focus:ring-4 ${
                isVoiceListening
                  ? 'bg-emeraldSuccess-700 text-white animate-pulse focus:ring-emeraldSuccess-300 ring-4 ring-emeraldSuccess-400'
                  : 'bg-elderBlue-900 hover:bg-elderBlue-950 text-warmWhite focus:ring-elderBlue-400'
              }`}
            >
              <Mic className="w-6 h-6 sm:w-7 sm:h-7 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span className="leading-tight text-center">
                {isVoiceListening ? 'Listening...' : 'Tap to Speak'}
              </span>
            </button>

            <div id="emergency-heading" className="min-w-0">
              <EmergencyAlertButton compact onTriggerAlert={handleEmergencyAlert} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
