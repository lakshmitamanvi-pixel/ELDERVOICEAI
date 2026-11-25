import React, { useState } from 'react';
import { AlertTriangle, PhoneCall, CheckCircle2 } from 'lucide-react';

export const EmergencyAlertButton = ({
  onTriggerAlert,
  emergencyContactName = 'Daughter (Sarah)',
  compact = false,
}) => {
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
    <div className="w-full min-w-0">
      <button
        type="button"
        onClick={handlePress}
        disabled={isAlerting}
        aria-label="Emergency SOS: alert caretaker and family members"
        className={`w-full min-w-0 min-h-[60px] ${
          compact ? 'px-3 sm:px-5 py-3 text-lg sm:text-xl gap-2' : 'px-4 sm:px-8 py-4 sm:py-5 text-xl sm:text-2xl gap-3 sm:gap-4'
        } rounded-2xl font-bold tracking-wide flex items-center justify-center transition-all duration-200 shadow-lg focus:outline-none focus:ring-4 ${
          alertSent
            ? 'bg-emeraldSuccess-700 text-white focus:ring-emeraldSuccess-300 ring-4 ring-emeraldSuccess-400'
            : 'bg-crimsonAlert-700 hover:bg-crimsonAlert-800 active:scale-[0.98] text-white focus:ring-crimsonAlert-300 shadow-alert-glow'
        }`}
      >
        {alertSent ? (
          <>
            <CheckCircle2 className={`${compact ? 'w-6 h-6' : 'w-8 h-8 sm:w-9 sm:h-9'} flex-shrink-0 stroke-[2.5]`} aria-hidden="true" />
            <span className="text-center leading-tight">
              {compact ? 'Help Sent!' : `Help Alert Sent to ${emergencyContactName}`}
            </span>
          </>
        ) : isAlerting ? (
          <>
            <div className={`${compact ? 'w-6 h-6' : 'w-8 h-8'} border-4 border-white border-t-transparent rounded-full animate-spin flex-shrink-0`} />
            <span className="text-center leading-tight">
              {compact ? 'Sending...' : 'Contacting Family & Caretaker...'}
            </span>
          </>
        ) : (
          <>
            <AlertTriangle className={`${compact ? 'w-6 h-6' : 'w-8 h-8 sm:w-9 sm:h-9'} flex-shrink-0 stroke-[2.5]`} aria-hidden="true" />
            <span className="text-center leading-tight">
              {compact ? 'SOS HELP' : 'EMERGENCY SOS HELP'}
            </span>
            {!compact && <PhoneCall className="w-7 h-7 sm:w-8 sm:h-8 flex-shrink-0 hidden sm:block" aria-hidden="true" />}
          </>
        )}
      </button>
    </div>
  );
};

export default EmergencyAlertButton;

