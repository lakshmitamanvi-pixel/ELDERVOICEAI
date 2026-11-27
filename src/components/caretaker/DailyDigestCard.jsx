import React, { useState } from 'react';
import {
  FileText,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Eye,
  Clock,
} from 'lucide-react';

function AdherenceBadge({ pct }) {
  if (pct === null || pct === undefined) {
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm sm:text-base font-bold bg-elderBlue-100 text-elderBlue-900 border border-elderBlue-300">
        No doses scheduled
      </span>
    );
  }
  const isGood = pct >= 80;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm sm:text-base font-bold border ${
        isGood
          ? 'bg-emeraldSuccess-100 text-emeraldSuccess-900 border-emeraldSuccess-400'
          : 'bg-amber-100 text-amber-950 border-amber-400'
      }`}
    >
      {isGood && <CheckCircle2 className="w-4 h-4 text-emeraldSuccess-700 flex-shrink-0" aria-hidden="true" />}
      <span>{pct}% adherence</span>
    </span>
  );
}

export const DailyDigestCard = ({ digests = [], onPreviewYesterday }) => {
  const [showHistory, setShowHistory] = useState(false);
  const [previewDigest, setPreviewDigest] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  const latestRecord = digests[0] || null;
  const activeDigest = previewDigest || latestRecord?.digest || null;
  const isLatestFailed = !previewDigest && latestRecord?.status === 'failed';

  const handlePreviewClick = async () => {
    if (!onPreviewYesterday) return;
    setIsPreviewLoading(true);
    try {
      const result = await onPreviewYesterday();
      setPreviewDigest(result);
    } finally {
      setIsPreviewLoading(false);
    }
  };

  return (
    <section
      aria-label="Daily digest"
      className="bg-white border-3 border-elderBlue-100 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4 min-w-0"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="p-2.5 bg-elderBlue-100 text-elderBlue-900 rounded-2xl flex-shrink-0">
            <FileText className="w-6 h-6 stroke-[2.5]" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h3 className="text-xl sm:text-2xl font-extrabold text-elderBlue-950 break-words">
              Daily digest
            </h3>
            {previewDigest && (
              <span className="inline-block text-xs sm:text-sm font-bold text-elderBlue-700 bg-elderBlue-50 px-2.5 py-0.5 rounded-full border border-elderBlue-200 mt-0.5">
                Dry-run preview (not sent)
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          {previewDigest && (
            <button
              type="button"
              onClick={() => setPreviewDigest(null)}
              className="min-h-[48px] w-full sm:w-auto px-4 py-2.5 rounded-2xl border-2 border-elderBlue-200 bg-warmWhite-paper hover:bg-elderBlue-50 text-elderBlue-900 font-bold text-base transition-colors"
            >
              Close preview
            </button>
          )}
          <button
            type="button"
            onClick={handlePreviewClick}
            disabled={isPreviewLoading}
            className="min-h-[48px] w-full sm:w-auto px-4 py-2.5 rounded-2xl bg-elderBlue-800 hover:bg-elderBlue-900 text-warmWhite font-bold text-base flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <Eye className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span>{isPreviewLoading ? 'Building preview...' : "Preview yesterday's digest"}</span>
          </button>
        </div>
      </div>

      {isLatestFailed ? (
        <div className="p-4 rounded-2xl bg-crimsonAlert-50 border-2 border-crimsonAlert-300 text-crimsonAlert-950 space-y-1 min-w-0">
          <div className="flex items-center gap-2 font-extrabold text-lg">
            <AlertTriangle className="w-5 h-5 text-crimsonAlert-700 flex-shrink-0" aria-hidden="true" />
            <span>digest failed</span>
          </div>
          <p className="text-sm sm:text-base font-medium break-words">
            Date: {latestRecord.id}
            {latestRecord.error ? ` — ${latestRecord.error}` : ''}
          </p>
        </div>
      ) : !activeDigest ? (
        <p className="text-base sm:text-lg font-medium text-elderBlue-700 bg-warmWhite-paper p-4 rounded-2xl border border-elderBlue-100">
          No digest yet.
        </p>
      ) : (
        <div className="space-y-3 bg-warmWhite-paper p-4 rounded-2xl border border-elderBlue-100 min-w-0">
          <div className="flex flex-wrap items-center justify-between gap-2 min-w-0">
            <span className="text-base sm:text-lg font-bold text-elderBlue-950">
              {activeDigest.date}
            </span>
            <AdherenceBadge pct={activeDigest.meds?.adherence_pct} />
          </div>

          {Array.isArray(activeDigest.flags) && activeDigest.flags.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {activeDigest.flags.map((flag, idx) => (
                <span
                  key={`${flag}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-sm sm:text-base font-bold bg-crimsonAlert-50 text-crimsonAlert-900 border border-crimsonAlert-300 break-words"
                >
                  <AlertTriangle className="w-4 h-4 text-crimsonAlert-700 flex-shrink-0" aria-hidden="true" />
                  <span>{flag}</span>
                </span>
              ))}
            </div>
          ) : (
            <p className="text-base font-semibold text-emeraldSuccess-800">
              All doses taken. No alerts.
            </p>
          )}

          {Array.isArray(activeDigest.meds?.missed) && activeDigest.meds.missed.length > 0 && (
            <div className="space-y-1.5 pt-1 min-w-0">
              <p className="text-sm sm:text-base font-bold text-elderBlue-900">Missed doses:</p>
              <ul className="space-y-1">
                {activeDigest.meds.missed.map((item, idx) => (
                  <li
                    key={`${item.name}-${item.time}-${idx}`}
                    className="flex items-center gap-2 text-sm sm:text-base font-medium text-elderBlue-900 break-words"
                  >
                    <Clock className="w-4 h-4 text-crimsonAlert-700 flex-shrink-0" aria-hidden="true" />
                    <span>
                      {item.name} — {item.time}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {activeDigest.activity && (
            <p className="text-sm sm:text-base text-elderBlue-700 font-medium pt-1">
              Activity: {activeDigest.activity.interactions_count} interactions ({activeDigest.activity.first_active_time}–{activeDigest.activity.last_active_time})
            </p>
          )}
        </div>
      )}

      {digests.length > 0 && (
        <div className="border-t border-elderBlue-100 pt-3 min-w-0">
          <button
            type="button"
            onClick={() => setShowHistory((prev) => !prev)}
            aria-expanded={showHistory}
            className="min-h-[48px] w-full px-4 py-2.5 rounded-2xl bg-warmWhite-paper hover:bg-elderBlue-50 border border-elderBlue-200 text-elderBlue-900 font-bold text-base flex items-center justify-between gap-2 transition-colors"
          >
            <span>Last 7 digests ({digests.length})</span>
            {showHistory ? (
              <ChevronUp className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            )}
          </button>

          {showHistory && (
            <ul className="mt-3 space-y-2 min-w-0">
              {digests.slice(0, 7).map((item) => {
                const pct = item.digest?.meds?.adherence_pct;
                const flagCount = item.digest?.flags?.length || 0;
                return (
                  <li
                    key={item.id}
                    className="p-3 rounded-xl bg-warmWhite-paper border border-elderBlue-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 min-w-0"
                  >
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span className="font-bold text-elderBlue-950">{item.id}</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-xs sm:text-sm font-bold ${
                          item.status === 'failed'
                            ? 'bg-crimsonAlert-100 text-crimsonAlert-900'
                            : 'bg-emeraldSuccess-100 text-emeraldSuccess-900'
                        }`}
                      >
                        {item.status === 'failed' ? 'digest failed' : 'sent'}
                      </span>
                    </div>
                    <div className="text-sm sm:text-base font-medium text-elderBlue-800 break-words">
                      {pct !== null && pct !== undefined ? `${pct}% adherence` : 'No doses scheduled'}
                      {flagCount > 0 ? ` · ${flagCount} alert${flagCount === 1 ? '' : 's'}` : ''}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};

export default DailyDigestCard;
