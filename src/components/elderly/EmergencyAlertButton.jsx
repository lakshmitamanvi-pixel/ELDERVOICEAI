import React, { useState } from 'react';
import { AlertTriangle, PhoneCall, CheckCircle2 } from 'lucide-react';

export const EmergencyAlertButton = ({ onTriggerAlert, emergencyContactName = 'Daughter (Sarah)' }) => {
  const [isAlerting, setIsAlerting] = useState(false);
  const [alertSent, setAlertSent] = useState(false);

  const handlePress = async () => {
    setIsAlerting(true);
    try {
      if (onTriggerAlert) {
        await onTriggerAlert();
      }
      setAlertSent(true);
      setTimeout(() => {
        setAlertSent(false);
        setIsAlerting(false);
      }, 5000);
    } catch (error) {
      console.error('Failed to trigger emergency alert:', error);
      setIsAlerting(false);
    }
  };

  return (
    <div className="w-full">
      <button
        onClick={handlePress}
        disabled={isAlerting}
        aria-label="Emergency SOS: alert caretaker and family members"
        className={`w-full min-h-[60px] px-8 py-5 rounded-2xl font-bold text-2xl tracking-wide flex items-center justify-center gap-4 transition-all duration-200 shadow-lg focus:outline-none focus:ring-4 ${
          alertSent
            ? 'bg-emeraldSuccess-700 text-white focus:ring-emeraldSuccess-300 ring-4 ring-emeraldSuccess-400'
            : 'bg-crimsonAlert-700 hover:bg-crimsonAlert-800 active:scale-[0.98] text-white focus:ring-crimsonAlert-300 shadow-alert-glow'
        }`}
      >
        {alertSent ? (
          <>
            <CheckCircle2 className="w-9 h-9 stroke-[2.5]" aria-hidden="true" />
            <span>Help Alert Sent to {emergencyContactName}</span>
          </>
        ) : isAlerting ? (
          <>
            <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
            <span>Contacting Family & Caretaker...</span>
          </>
        ) : (
          <>
            <AlertTriangle className="w-9 h-9 stroke-[2.5]" aria-hidden="true" />
            <span>EMERGENCY SOS HELP</span>
            <PhoneCall className="w-8 h-8 ml-2" aria-hidden="true" />
          </>
        )}
      </button>
    </div>
  );
};

export default EmergencyAlertButton;

