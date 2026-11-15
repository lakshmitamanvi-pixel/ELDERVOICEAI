import React, { useState, useEffect } from 'react';
import { Mic, MicOff, Volume2, VolumeX, Sparkles, Globe, Send, AlertCircle, MessageSquare } from 'lucide-react';
import {
  startListening,
  stopListening,
  speak,
  stopSpeech,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  getFallbackDetails,
  subscribeFallback,
  submitManualInput,
} from '../../services/speechService.js';
import { generateSeniorVoiceResponse } from '../../services/gemini.js';
import { SUPPORTED_LANGUAGES, getTranslation } from '../../utils/multilingual.js';

export const SeniorVoiceAssistant = ({ onAssistantResponse }) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [fallbackInfo, setFallbackInfo] = useState(() => getFallbackDetails());
  const [manualInputText, setManualInputText] = useState('');

  // Subscribe to speech service fallback notifications
  useEffect(() => {
    const unsubscribe = subscribeFallback((details) => {
      setFallbackInfo(details);
    });

    return () => {
      stopSpeech();
      stopListening();
      unsubscribe();
    };
  }, []);

  const handleProcessVoiceInput = async (spokenText) => {
    if (!spokenText || spokenText.trim().length === 0) return;

    setIsProcessing(true);
    setTranscript(spokenText);
    try {
      const response = await generateSeniorVoiceResponse(spokenText);
      setAiResponse(response);
      if (onAssistantResponse) {
        onAssistantResponse({ prompt: spokenText, response });
      }

      if (speechEnabled && isSpeechSynthesisSupported()) {
        await speak(response, selectedLanguage, { rate: 0.9, pitch: 1.0 });
      }
    } catch (error) {
      console.error('Error generating AI voice response:', error);
      const fallback = 'I heard you, and I am here with you.';
      setAiResponse(fallback);
      if (speechEnabled && isSpeechSynthesisSupported()) {
        await speak(fallback, selectedLanguage, { rate: 0.9, pitch: 1.0 });
      }
    } finally {
      setIsProcessing(false);
      setInterimTranscript('');
    }
  };

  const toggleListening = () => {
    if (isListening) {
      stopListening();
      setIsListening(false);
      return;
    }

    stopSpeech();
    setTranscript('');
    setInterimTranscript('');

    const startResult = startListening(
      selectedLanguage,
      async (result) => {
        setTranscript(result.transcript);
        setInterimTranscript(result.interimTranscript);

        if (result.isFinal && result.transcript.trim().length > 0) {
          await handleProcessVoiceInput(result.transcript);
        }
      },
      (state, details) => {
        if (state === 'listening') {
          setIsListening(true);
        } else if (state === 'idle') {
          setIsListening(false);
        } else if (state === 'error' || state === 'unsupported') {
          setIsListening(false);
        }
      },
      (fallbackData) => {
        setFallbackInfo(fallbackData);
      }
    );

    if (!startResult.success) {
      setIsListening(false);
    }
  };

  const handleManualSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!manualInputText.trim() || isProcessing) return;

    const query = manualInputText.trim();
    setManualInputText('');
    await submitManualInput(query, handleProcessVoiceInput);
  };

  const handleQuickPrompt = async (promptText) => {
    if (isProcessing) return;
    await submitManualInput(promptText, handleProcessVoiceInput);
  };

  const toggleSpeechAudio = () => {
    const nextState = !speechEnabled;
    setSpeechEnabled(nextState);
    if (!nextState) {
      stopSpeech();
    }
  };

  const isSttAvailable = isSpeechRecognitionSupported() && !fallbackInfo.active;

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
            onChange={(e) => {
              setSelectedLanguage(e.target.value);
              if (isListening) {
                stopListening();
              }
            }}
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

      {/* Fallback Notice Banner if STT is unavailable or errored */}
      {fallbackInfo.active && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border-3 border-amber-300 text-elderBlue-950 flex items-start gap-3">
          <AlertCircle className="w-7 h-7 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <p className="text-lg font-bold text-amber-900">Voice Input Fallback Active</p>
            <p className="text-base text-elderBlue-900 mt-1">
              {fallbackInfo.message || 'Microphone access is unavailable. You can use the manual text controls below.'}
            </p>
          </div>
        </div>
      )}

      {/* Manual Input Trigger & Quick Prompts Fallback Area */}
      <div className="mt-2 mb-6 p-5 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200">
        <div className="flex items-center gap-2 mb-3 text-elderBlue-800 font-bold text-lg">
          <MessageSquare className="w-5 h-5 text-elderBlue-700" aria-hidden="true" />
          <span>Manual Input & Quick Fallback Options:</span>
        </div>

        <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={manualInputText}
            onChange={(e) => setManualInputText(e.target.value)}
            placeholder="Type your question or request here..."
            disabled={isProcessing}
            className="flex-1 min-h-[56px] px-4 py-3 bg-warmWhite text-elderBlue-950 font-semibold text-lg border-2 border-elderBlue-300 rounded-xl focus:ring-4 focus:ring-elderBlue-400 focus:outline-none disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={!manualInputText.trim() || isProcessing}
            className="min-h-[56px] px-6 py-3 bg-elderBlue-800 hover:bg-elderBlue-900 disabled:bg-elderBlue-300 text-warmWhite font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors focus:ring-4 focus:ring-elderBlue-400 focus:outline-none"
          >
            <Send className="w-5 h-5" aria-hidden="true" />
            <span>Send</span>
          </button>
        </form>

        <div className="mt-3 flex flex-wrap gap-2">
          <span className="text-sm font-bold text-elderBlue-700 self-center">Quick Suggestions:</span>
          <button
            type="button"
            onClick={() => handleQuickPrompt('How can I contact my family?')}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-warmWhite hover:bg-elderBlue-100 border border-elderBlue-300 rounded-lg text-sm font-semibold text-elderBlue-900 transition-colors"
          >
            "How can I contact my family?"
          </button>
          <button
            type="button"
            onClick={() => handleQuickPrompt('What medications should I take today?')}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-warmWhite hover:bg-elderBlue-100 border border-elderBlue-300 rounded-lg text-sm font-semibold text-elderBlue-900 transition-colors"
          >
            "What medications today?"
          </button>
          <button
            type="button"
            onClick={() => handleQuickPrompt('I need assistance right now.')}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-warmWhite hover:bg-elderBlue-100 border border-elderBlue-300 rounded-lg text-sm font-semibold text-elderBlue-900 transition-colors"
          >
            "I need assistance"
          </button>
        </div>
      </div>

      {/* Spoken Text Display */}
      {(transcript || interimTranscript) && (
        <div className="mt-4 p-5 rounded-2xl bg-elderBlue-50 border-3 border-elderBlue-200">
          <p className="text-lg font-bold text-elderBlue-700 uppercase tracking-wider">
            {isListening ? 'Listening (Speaking...)' : 'You Said:'}
          </p>
          <p className="text-2xl font-bold text-elderBlue-950 mt-1">
            "{transcript || interimTranscript}"
          </p>
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
