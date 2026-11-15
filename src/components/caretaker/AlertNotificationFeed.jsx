import React from 'react';
import { AlertCircle, Bell, CheckCircle, Clock } from 'lucide-react';
import { formatRelativeTime } from '../../utils/formatters.js';

export const AlertNotificationFeed = ({
  alerts = [
    {
      id: 'a-1',
      title: 'Morning Voice Check-in Completed',
      message: 'Senior responded cheerfully and asked about today’s weather.',
      type: 'info',
      timestamp: new Date(Date.now() - 1000 * 60 * 25),
    },
    {
      id: 'a-2',
      title: 'Blood Pressure Medication Taken',
      message: 'Logged on schedule at 8:05 AM.',
      type: 'success',
      timestamp: new Date(Date.now() - 1000 * 60 * 140),
    },
  ],
}) => {
  return (
    <div className="bg-white border-3 border-elderBlue-100 rounded-3xl p-6 shadow-md">
      <div className="flex items-center gap-3 pb-4 border-b-2 border-elderBlue-50">
        <Bell className="w-7 h-7 text-elderBlue-800 stroke-[2.5]" aria-hidden="true" />
        <h3 className="text-2xl font-bold text-elderBlue-950">Recent Activity & Alerts</h3>
      </div>

      <div className="mt-4 space-y-4">
        {alerts.length === 0 ? (
          <p className="text-xl text-elderBlue-700 py-6 text-center font-medium">
            No active alerts at this time.
          </p>
        ) : (
          alerts.map((item) => {
            const isAlert = item.type === 'alert' || item.type === 'emergency';
            const isSuccess = item.type === 'success';

            return (
              <div
                key={item.id}
                className={`p-4 rounded-2xl border-2 flex items-start gap-4 ${
                  isAlert
                    ? 'bg-crimsonAlert-50 border-crimsonAlert-300'
                    : isSuccess
                    ? 'bg-emeraldSuccess-50 border-emeraldSuccess-300'
                    : 'bg-warmWhite border-elderBlue-200'
                }`}
              >
                <div className="mt-1 flex-shrink-0">
                  {isAlert ? (
                    <AlertCircle className="w-7 h-7 text-crimsonAlert-700 stroke-[2.5]" aria-hidden="true" />
                  ) : isSuccess ? (
                    <CheckCircle className="w-7 h-7 text-emeraldSuccess-700 stroke-[2.5]" aria-hidden="true" />
                  ) : (
                    <Clock className="w-7 h-7 text-elderBlue-700 stroke-[2.5]" aria-hidden="true" />
                  )}
                </div>

                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h4
                      className={`text-xl font-bold ${
                        isAlert
                          ? 'text-crimsonAlert-900'
                          : isSuccess
                          ? 'text-emeraldSuccess-900'
                          : 'text-elderBlue-950'
                      }`}
                    >
                      {item.title}
                    </h4>
                    <span className="text-base font-semibold text-elderBlue-600">
                      {formatRelativeTime(item.timestamp)}
                    </span>
                  </div>
                  <p className="text-lg text-elderBlue-800 font-medium mt-1">{item.message}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default AlertNotificationFeed;

