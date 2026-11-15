import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Globe } from 'lucide-react';
import { createSpeechRecognizer, speakText, stopSpeech, isSpeechRecognitionSupported } from '../../services/speech.js';
import { generateSeniorVoiceResponse } from '../../services/gemini.js';
import { SUPPORTED_LANGUAGES, getTranslation } from '../../utils/multilingual.js';

export const SeniorVoiceAssistant = ({ onAssistantResponse }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [recognizer, setRecognizer] = useState(null);

  useEffect(() => {
    if (!isSpeechRecognitionSupported()) return;

    const instance = createSpeechRecognizer({
      language: selectedLanguage,
      continuous: false,
      interimResults: true,
      onStart: () => setIsListening(true),
      onEnd: () => setIsListening(false),
      onResult: async (text, isFinal) => {
        setTranscript(text);
        if (isFinal && text.trim().length > 0) {
          await handleProcessVoiceInput(text);
        }
      },
      onError: (err) => {
        console.error('Speech recognition error:', err);
        setIsListening(false);
      },
    });

    setRecognizer(instance);

    return () => {
      stopSpeech();
      if (instance && instance.abort) {
        instance.abort();
      }
    };
  }, [selectedLanguage]);

  const handleProcessVoiceInput = async (spokenText) => {
    setIsProcessing(true);
    try {
      const response = await generateSeniorVoiceResponse(spokenText);
      setAiResponse(response);
      if (onAssistantResponse) {
        onAssistantResponse({ prompt: spokenText, response });
      }

      if (speechEnabled) {
        speakText(response, { language: selectedLanguage, rate: 0.85 });
      }
    } catch (error) {
      console.error('Error generating AI voice response:', error);
      const fallback = 'I heard you, and I am here with you.';
      setAiResponse(fallback);
      if (speechEnabled) {
        speakText(fallback, { language: selectedLanguage });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const toggleListening = () => {
    if (!recognizer) {
      handleProcessVoiceInput('How can I contact my family?');
      return;
    }

    if (isListening) {
      recognizer.stop();
      setIsListening(false);
    } else {
      stopSpeech();
      setTranscript('');
      try {
        recognizer.start();
      } catch (err) {
        console.error('Recognizer start failed:', err);
      }
    }
  };

  const toggleSpeechAudio = () => {
    const nextState = !speechEnabled;
    setSpeechEnabled(nextState);
    if (!nextState) {
      stopSpeech();
    }
  };

  return (
    <div className="bg-warmWhite-paper border-3 border-elderBlue-200 rounded-3xl p-6 sm:p-8 shadow-xl">
      {/* Top Controls: Language and Speech Output */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b-2 border-elderBlue-100">
        <div className="flex items-center gap-3">
          <Globe className="w-7 h-7 text-elderBlue-700 stroke-[2.5]" aria-hidden="true" />
          <label htmlFor="language-select" className="text-xl font-bold text-elderBlue-900">
            Language:
          </label>
          <select
            id="language-select"
            value={selectedLanguage}
            onChange={(e) => setSelectedLanguage(e.target.value)}
            className="min-h-[60px] px-4 py-2 bg-warmWhite text-elderBlue-950 font-bold text-xl border-3 border-elderBlue-300 rounded-xl focus:ring-4 focus:ring-elderBlue-400 focus:outline-none cursor-pointer"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.native} ({lang.label})
              </option>
            ))}
          </select>
        </div>

        <button
          onClick={toggleSpeechAudio}
          aria-label={speechEnabled ? 'Mute AI voice responses' : 'Unmute AI voice responses'}
          className="min-h-[60px] px-5 py-3 rounded-xl border-3 border-elderBlue-400 font-bold text-xl flex items-center gap-3 bg-warmWhite text-elderBlue-900 hover:bg-elderBlue-100 focus:outline-none focus:ring-4 focus:ring-elderBlue-300"
        >
          {speechEnabled ? (
            <>
              <Volume2 className="w-7 h-7 text-emeraldSuccess-700 stroke-[2.5]" aria-hidden="true" />
              <span>Voice Readout: On</span>
            </>
          ) : (
            <>
              <VolumeX className="w-7 h-7 text-crimsonAlert-700 stroke-[2.5]" aria-hidden="true" />
              <span>Voice Readout: Off</span>
            </>
          )}
        </button>
      </div>

      {/* Main Voice Activation Button */}
      <div className="py-10 flex flex-col items-center justify-center text-center">
        <button
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Start speaking with assistant'}
          className={`relative min-h-[96px] min-w-[280px] sm:min-w-[340px] px-10 py-6 rounded-full font-bold text-2xl flex items-center justify-center gap-4 transition-all duration-300 shadow-2xl focus:outline-none focus:ring-4 ${
            isListening
              ? 'bg-emeraldSuccess-700 text-white animate-pulse focus:ring-emeraldSuccess-300 ring-4 ring-emeraldSuccess-400'
              : 'bg-elderBlue-900 hover:bg-elderBlue-950 text-warmWhite hover:scale-[1.02] focus:ring-elderBlue-400'
          }`}
        >
          {isListening ? (
            <>
              <Mic className="w-10 h-10 stroke-[3] text-white" aria-hidden="true" />
              <span>{getTranslation('listening', selectedLanguage)}</span>
            </>
          ) : (
            <>
              <Mic className="w-10 h-10 stroke-[2.5] text-warmWhite" aria-hidden="true" />
              <span>{getTranslation('pressToSpeak', selectedLanguage)}</span>
            </>
          )}
        </button>

        <p className="mt-4 text-xl text-elderBlue-800 font-semibold">
          Tap the big button above and speak naturally in your normal voice.
        </p>
      </div>

      {/* Spoken Text Display */}
      {transcript && (
        <div className="mt-4 p-5 rounded-2xl bg-elderBlue-50 border-3 border-elderBlue-200">
          <p className="text-lg font-bold text-elderBlue-700 uppercase tracking-wider">You Said:</p>
          <p className="text-2xl font-bold text-elderBlue-950 mt-1">"{transcript}"</p>
        </div>
      )}

      {/* Assistant Response Display */}
      <div className="mt-6 p-6 rounded-2xl bg-warmWhite-card border-3 border-elderBlue-300 shadow-inner">
        <div className="flex items-center gap-3 text-elderBlue-800 font-bold text-xl pb-2 border-b-2 border-elderBlue-100">
          <Sparkles className="w-7 h-7 text-elderBlue-600 stroke-[2.5]" aria-hidden="true" />
          <span>ElderVoice AI Assistant:</span>
        </div>
        <p className="text-2xl font-medium text-elderBlue-950 mt-4 leading-relaxed">
          {isProcessing ? (
            <span className="italic text-elderBlue-600 animate-pulse">
              Thinking carefully and preparing your answer...
            </span>
          ) : (
            aiResponse || getTranslation('greeting', selectedLanguage)
          )}
        </p>
      </div>
    </div>
  );
};

export default SeniorVoiceAssistant;

