import React, { useState } from 'react';
import { Pill, Check, Clock } from 'lucide-react';

export const MedicationReminderCard = ({
  medication = {
    id: 'med-1',
    name: 'Blood Pressure Tablet (Lisinopril)',
    dosage: '10mg with breakfast',
    time: '8:00 AM',
    taken: false,
  },
  onToggleTaken,
}) => {
  const [isTaken, setIsTaken] = useState(medication.taken || false);

  const handleToggle = () => {
    const nextState = !isTaken;
    setIsTaken(nextState);
    if (onToggleTaken) {
      onToggleTaken(medication.id, nextState);
    }
  };

  return (
    <div className="bg-warmWhite-card border-3 border-elderBlue-100 rounded-3xl p-4 sm:p-6 shadow-md transition-all hover:border-elderBlue-300 min-w-0">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 min-w-0">
        <div className="flex items-start gap-3 sm:gap-4 min-w-0 w-full sm:flex-1">
          <div className="p-3 sm:p-4 rounded-2xl bg-elderBlue-100 text-elderBlue-900 flex-shrink-0">
            <Pill className="w-7 h-7 sm:w-8 sm:h-8 stroke-[2.5]" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-elderBlue-700 text-lg font-semibold">
              <Clock className="w-5 h-5 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>{medication.time}</span>
            </div>
            <h3 className="text-xl sm:text-2xl font-bold text-elderBlue-950 mt-1 break-words">
              {medication.name}
            </h3>
            <p className="text-lg sm:text-xl text-elderBlue-800 font-medium mt-1 break-words">
              {medication.dosage}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggle}
          aria-pressed={isTaken}
          className={`w-full sm:w-auto min-h-[60px] px-5 sm:px-6 py-3 rounded-2xl font-bold text-xl flex items-center justify-center gap-3 transition-colors duration-200 focus:outline-none focus:ring-4 flex-shrink-0 ${
            isTaken
              ? 'bg-emeraldSuccess-700 text-white hover:bg-emeraldSuccess-800 focus:ring-emeraldSuccess-300 shadow-success-glow'
              : 'bg-elderBlue-800 text-warmWhite hover:bg-elderBlue-900 focus:ring-elderBlue-300'
          }`}
        >
          <Check className={`w-7 h-7 stroke-[3] flex-shrink-0 ${isTaken ? 'scale-110' : ''}`} aria-hidden="true" />
          <span>{isTaken ? 'Taken ✓' : 'Mark as Taken'}</span>
        </button>
      </div>
    </div>
  );
};

export default MedicationReminderCard;

