import React from 'react';
import {
  CheckCircle2,
  Clock,
  AlertOctagon,
  TrendingUp,
  Activity,
  Calendar,
} from 'lucide-react';

export const AdherenceTracker = ({ medications = [], onUpdateStatus }) => {
  const total = medications.length;
  const confirmedCount = medications.filter((m) => m.status === 'confirmed').length;
  const pendingCount = medications.filter((m) => m.status === 'pending').length;
  const missedCount = medications.filter((m) => m.status === 'missed').length;

  const adherencePercentage = total > 0 ? Math.round((confirmedCount / total) * 100) : 0;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'confirmed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-base font-bold bg-emeraldSuccess-100 text-emeraldSuccess-900 border-2 border-emeraldSuccess-400">
            <CheckCircle2 className="w-5 h-5 stroke-[2.5] text-emeraldSuccess-700" aria-hidden="true" />
            Confirmed
          </span>
        );
      case 'missed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-base font-bold bg-crimsonAlert-100 text-crimsonAlert-900 border-2 border-crimsonAlert-400">
            <AlertOctagon className="w-5 h-5 stroke-[2.5] text-crimsonAlert-700" aria-hidden="true" />
            Missed
          </span>
        );
      case 'pending':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-base font-bold bg-amber-100 text-amber-950 border-2 border-amber-400">
            <Clock className="w-5 h-5 stroke-[2.5] text-amber-700" aria-hidden="true" />
            Pending
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-3xl border-3 border-elderBlue-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-elderBlue-600 uppercase tracking-wide">
              Today's Adherence
            </p>
            <p className="text-3xl font-extrabold text-elderBlue-950 mt-1">
              {adherencePercentage}%
            </p>
          </div>
          <div className="p-3.5 bg-elderBlue-50 text-elderBlue-800 rounded-2xl border-2 border-elderBlue-200">
            <TrendingUp className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-emeraldSuccess-50/70 p-5 rounded-3xl border-3 border-emeraldSuccess-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-emeraldSuccess-800 uppercase tracking-wide">
              Confirmed Taken
            </p>
            <p className="text-3xl font-extrabold text-emeraldSuccess-950 mt-1">
              {confirmedCount} <span className="text-lg font-medium text-emeraldSuccess-700">/ {total}</span>
            </p>
          </div>
          <div className="p-3.5 bg-emeraldSuccess-100 text-emeraldSuccess-800 rounded-2xl border-2 border-emeraldSuccess-300">
            <CheckCircle2 className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-amber-50/70 p-5 rounded-3xl border-3 border-amber-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-amber-900 uppercase tracking-wide">
              Pending Next Dose
            </p>
            <p className="text-3xl font-extrabold text-amber-950 mt-1">
              {pendingCount}
            </p>
          </div>
          <div className="p-3.5 bg-amber-100 text-amber-800 rounded-2xl border-2 border-amber-300">
            <Clock className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
          </div>
        </div>

        <div className="bg-crimsonAlert-50/70 p-5 rounded-3xl border-3 border-crimsonAlert-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-base font-bold text-crimsonAlert-800 uppercase tracking-wide">
              Missed Doses
            </p>
            <p className="text-3xl font-extrabold text-crimsonAlert-950 mt-1">
              {missedCount}
            </p>
          </div>
          <div className="p-3.5 bg-crimsonAlert-100 text-crimsonAlert-800 rounded-2xl border-2 border-crimsonAlert-300">
            <AlertOctagon className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Live Medication Adherence Table / Feed */}
      <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-4 sm:p-6 shadow-md min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b-2 border-elderBlue-100">
          <div className="min-w-0">
            <h3 className="text-xl sm:text-2xl font-bold text-elderBlue-950">
              Live Medication Schedule & Verification
            </h3>
            <p className="text-base sm:text-lg text-elderBlue-700 font-medium mt-0.5">
              Real-time Firestore synchronization of today’s doses and verification states.
            </p>
          </div>
          <div className="flex items-center gap-2 text-elderBlue-800 text-base sm:text-lg font-bold bg-elderBlue-50 px-4 py-2 rounded-xl border border-elderBlue-200 self-start sm:self-auto flex-shrink-0">
            <Calendar className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span>Today's Log</span>
          </div>
        </div>

        {medications.length === 0 ? (
          <div className="text-center py-12">
            <Activity className="w-12 h-12 text-elderBlue-300 mx-auto mb-2" aria-hidden="true" />
            <p className="text-xl font-bold text-elderBlue-900">No medications logged in Firestore yet.</p>
            <p className="text-lg text-elderBlue-600">Use the Medications tab to schedule the first prescription.</p>
          </div>
        ) : (
          <div className="divide-y-2 divide-elderBlue-100 mt-2">
            {medications.map((med) => (
              <div
                key={med.id}
                className="py-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-warmWhite-paper/50 px-1 sm:px-2 rounded-2xl transition-colors min-w-0"
              >
                <div className="flex items-start gap-3 sm:gap-4 min-w-0">
                  <div className="p-2.5 sm:p-3 bg-elderBlue-100 text-elderBlue-900 rounded-2xl font-extrabold text-lg sm:text-xl flex items-center justify-center min-w-[64px] sm:min-w-[70px] flex-shrink-0">
                    {med.scheduleTime || '00:00'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                      <h4 className="text-xl sm:text-2xl font-bold text-elderBlue-950 break-words">{med.name}</h4>
                      <span className="text-lg sm:text-xl font-bold text-elderBlue-700">({med.dosage})</span>
                      {getStatusBadge(med.status)}
                    </div>
                    {med.instructions && (
                      <p className="text-base sm:text-lg text-elderBlue-800 font-medium mt-1 break-words">
                        Instructions: {med.instructions}
                      </p>
                    )}
                  </div>
                </div>

                {/* Status Toggle Actions: Minimum touch targets enforced */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-base font-bold text-elderBlue-600 mr-1">Caretaker Action:</span>
                  <button
                    onClick={() => onUpdateStatus(med.id, 'confirmed')}
                    aria-label={`Mark ${med.name} as confirmed`}
                    className={`min-h-[48px] px-3.5 py-2 rounded-xl font-bold text-base flex items-center gap-1.5 transition-all focus:outline-none focus:ring-4 ${
                      med.status === 'confirmed'
                        ? 'bg-emeraldSuccess-700 text-white shadow-sm ring-2 ring-emeraldSuccess-300'
                        : 'bg-emeraldSuccess-50 text-emeraldSuccess-900 hover:bg-emeraldSuccess-100 border border-emeraldSuccess-300'
                    }`}
                  >
                    <CheckCircle2 className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                    <span>Confirm</span>
                  </button>

                  <button
                    onClick={() => onUpdateStatus(med.id, 'pending')}
                    aria-label={`Mark ${med.name} as pending`}
                    className={`min-h-[48px] px-3.5 py-2 rounded-xl font-bold text-base flex items-center gap-1.5 transition-all focus:outline-none focus:ring-4 ${
                      med.status === 'pending'
                        ? 'bg-amber-600 text-white shadow-sm ring-2 ring-amber-300'
                        : 'bg-amber-50 text-amber-950 hover:bg-amber-100 border border-amber-300'
                    }`}
                  >
                    <Clock className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                    <span>Pending</span>
                  </button>

                  <button
                    onClick={() => onUpdateStatus(med.id, 'missed')}
                    aria-label={`Mark ${med.name} as missed`}
                    className={`min-h-[48px] px-3.5 py-2 rounded-xl font-bold text-base flex items-center gap-1.5 transition-all focus:outline-none focus:ring-4 ${
                      med.status === 'missed'
                        ? 'bg-crimsonAlert-700 text-white shadow-sm ring-2 ring-crimsonAlert-300'
                        : 'bg-crimsonAlert-50 text-crimsonAlert-900 hover:bg-crimsonAlert-100 border border-crimsonAlert-300'
                    }`}
                  >
                    <AlertOctagon className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
                    <span>Missed</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AdherenceTracker;

