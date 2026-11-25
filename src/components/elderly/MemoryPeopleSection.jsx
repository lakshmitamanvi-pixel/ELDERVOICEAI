import React, { useState, useEffect } from 'react';
import { Users, Bookmark, Volume2, Square, Heart } from 'lucide-react';
import { speak, stopSpeech, isSpeechSynthesisSupported } from '../../services/speechService.js';

/**
 * Read-only Senior View for Family/People & Cherished Anecdotes.
 * Displays big photo/avatar, name, relation, 1-line anecdote, and "Play Voice Note".
 */
export const MemoryPeopleSection = ({ profile = {} }) => {
  const [playingId, setPlayingId] = useState(null);
  const familyMembers = profile?.memoryVault?.familyMembers || [];
  const personalFacts = profile?.memoryVault?.personalFacts || [];

  useEffect(() => {
    return () => {
      stopSpeech();
    };
  }, []);

  const handlePlayVoiceNote = async (id, spokenText) => {
    if (playingId === id) {
      stopSpeech();
      setPlayingId(null);
      return;
    }

    stopSpeech();
    if (!isSpeechSynthesisSupported()) return;

    setPlayingId(id);
    try {
      await speak(spokenText, profile?.primaryLanguage || 'en-US', { rate: 0.9, pitch: 1.0 });
    } catch (err) {
      console.warn('[MemoryPeopleSection] Voice note playback note:', err);
    } finally {
      setPlayingId((current) => (current === id ? null : current));
    }
  };

  const getInitials = (name = '') => {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase() || '?';
  };

  if (familyMembers.length === 0 && personalFacts.length === 0) {
    return null;
  }

  return (
    <div className="space-y-6">
      {/* Family & People */}
      {familyMembers.length > 0 && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 id="memories-heading" className="text-2xl font-bold text-elderBlue-950 flex items-center gap-2.5 min-w-0">
              <Users className="w-7 h-7 text-elderBlue-800 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Family & Loved Ones</span>
            </h2>
            <span className="text-lg font-bold text-elderBlue-700 bg-elderBlue-100 px-4 py-1.5 rounded-full">
              {familyMembers.length} {familyMembers.length === 1 ? 'Person' : 'People'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {familyMembers.map((person) => {
              const isPlaying = playingId === person.id;
              const voiceScript = `${person.name}, your ${person.relationship}. ${person.note || ''}`.trim();

              return (
                <article
                  key={person.id}
                  className="bg-white border-3 border-elderBlue-200 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between gap-4 min-w-0"
                >
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    {/* Big Photo / Avatar */}
                    {person.photoUrl ? (
                      <img
                        src={person.photoUrl}
                        alt={person.name}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl object-cover border-3 border-elderBlue-200 flex-shrink-0"
                      />
                    ) : (
                      <div
                        aria-hidden="true"
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-2xl bg-elderBlue-800 text-warmWhite flex items-center justify-center text-2xl sm:text-3xl font-extrabold border-3 border-elderBlue-900 flex-shrink-0 shadow-inner"
                      >
                        {getInitials(person.name)}
                      </div>
                    )}

                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl sm:text-2xl font-extrabold text-elderBlue-950 break-words">
                        {person.name}
                      </h3>
                      <span className="inline-block mt-1 px-3 py-0.5 rounded-full bg-elderBlue-100 text-elderBlue-900 text-lg font-bold">
                        {person.relationship}
                      </span>
                      {person.note && (
                        <p className="text-lg text-elderBlue-800 font-medium mt-2 break-words">
                          {person.note}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlayVoiceNote(person.id, voiceScript)}
                    className={`w-full min-h-[56px] px-5 py-3 rounded-2xl font-bold text-xl flex items-center justify-center gap-2.5 transition-colors focus:outline-none focus:ring-4 ${
                      isPlaying
                        ? 'bg-crimsonAlert-700 hover:bg-crimsonAlert-800 text-white focus:ring-crimsonAlert-300'
                        : 'bg-elderBlue-800 hover:bg-elderBlue-900 text-warmWhite focus:ring-elderBlue-300'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Square className="w-6 h-6 fill-current flex-shrink-0" aria-hidden="true" />
                        <span>Stop Voice Note</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-6 h-6 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
                        <span>Play Voice Note</span>
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {/* Cherished Anecdotes */}
      {personalFacts.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-2xl font-bold text-elderBlue-950 flex items-center gap-2.5">
            <Heart className="w-7 h-7 text-emeraldSuccess-700 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
            <span>Cherished Memories & Anecdotes</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {personalFacts.map((fact) => {
              const isPlaying = playingId === fact.id;
              const voiceScript = `${fact.category}. ${fact.text}`;

              return (
                <article
                  key={fact.id}
                  className="bg-warmWhite-paper border-3 border-elderBlue-200 rounded-3xl p-4 sm:p-5 shadow-sm flex flex-col justify-between gap-4 min-w-0"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 text-elderBlue-700 font-bold text-base uppercase tracking-wide">
                      <Bookmark className="w-5 h-5 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
                      <span className="break-words">{fact.category}</span>
                    </div>
                    <p className="text-xl font-bold text-elderBlue-950 mt-2 leading-snug break-words">
                      {fact.text}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => handlePlayVoiceNote(fact.id, voiceScript)}
                    className={`w-full min-h-[56px] px-4 py-3 rounded-2xl font-bold text-lg flex items-center justify-center gap-2 transition-colors focus:outline-none focus:ring-4 ${
                      isPlaying
                        ? 'bg-crimsonAlert-700 hover:bg-crimsonAlert-800 text-white focus:ring-crimsonAlert-300'
                        : 'bg-emeraldSuccess-700 hover:bg-emeraldSuccess-800 text-white focus:ring-emeraldSuccess-300'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Square className="w-5 h-5 fill-current flex-shrink-0" aria-hidden="true" />
                        <span>Stop Voice Note</span>
                      </>
                    ) : (
                      <>
                        <Volume2 className="w-5 h-5 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
                        <span>Play Voice Note</span>
                      </>
                    )}
                  </button>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default MemoryPeopleSection;
