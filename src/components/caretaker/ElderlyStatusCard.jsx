import React from 'react';
import { HeartPulse, CheckCircle2, BatteryCharging, ShieldAlert } from 'lucide-react';

export const ElderlyStatusCard = ({
  seniorName = 'Eleanor Vance',
  status = 'Normal',
  lastCheckIn = '12 minutes ago',
  batteryLevel = 94,
  medicationCompliance = '2 of 3 taken',
}) => {
  const isHealthy = status === 'Normal';

  return (
    <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-4 sm:p-6 shadow-md min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b-2 border-elderBlue-50">
        <div className="min-w-0">
          <span className="text-base sm:text-lg font-semibold text-elderBlue-600 uppercase tracking-wide">
            Senior Profile
          </span>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-elderBlue-950 mt-1 break-words">{seniorName}</h2>
        </div>
        <div
          className={`flex items-center gap-2 px-4 py-2 rounded-full font-bold text-lg ${
            isHealthy
              ? 'bg-emeraldSuccess-50 text-emeraldSuccess-800 border-2 border-emeraldSuccess-300'
              : 'bg-crimsonAlert-50 text-crimsonAlert-800 border-2 border-crimsonAlert-300'
          }`}
        >
          {isHealthy ? (
            <>
              <CheckCircle2 className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
              <span>Status: Normal</span>
            </>
          ) : (
            <>
              <ShieldAlert className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
              <span>Attention Needed</span>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <div className="p-4 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-100">
          <div className="flex items-center gap-2 text-elderBlue-700 font-semibold text-lg">
            <HeartPulse className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            <span>Medications</span>
          </div>
          <p className="text-2xl font-bold text-elderBlue-950 mt-2">{medicationCompliance}</p>
        </div>

        <div className="p-4 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-100">
          <div className="flex items-center gap-2 text-elderBlue-700 font-semibold text-lg">
            <CheckCircle2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            <span>Last Check-In</span>
          </div>
          <p className="text-2xl font-bold text-elderBlue-950 mt-2">{lastCheckIn}</p>
        </div>

        <div className="p-4 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-100">
          <div className="flex items-center gap-2 text-elderBlue-700 font-semibold text-lg">
            <BatteryCharging className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            <span>Device Battery</span>
          </div>
          <p className="text-2xl font-bold text-elderBlue-950 mt-2">{batteryLevel}%</p>
        </div>
      </div>
    </div>
  );
};

export default ElderlyStatusCard;

