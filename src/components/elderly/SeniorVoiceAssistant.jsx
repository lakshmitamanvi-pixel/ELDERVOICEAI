import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
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
  TTSPipeline,
} from '../../services/speechService.js';
import { handleVoice, LatencyLogger, FILLER_TIMEOUT_MS } from '../../services/geminiService.js';
import { sendEmergencyEmailAlert } from '../../services/email.js';
import { logActivityEvent, logSosTriggered } from '../../services/loggingService.js';
import { SUPPORTED_LANGUAGES, getTranslation } from '../../utils/multilingual.js';

export const SeniorVoiceAssistant = forwardRef(({ onAssistantResponse, onListeningChange, onInputFocusChange }, ref) => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const [fallbackInfo, setFallbackInfo] = useState(() => getFallbackDetails());
  const [manualInputText, setManualInputText] = useState('');
  const pipelineRef = useRef(null);

  useEffect(() => {
    onListeningChange?.(isListening);
  }, [isListening, onListeningChange]);

  // Subscribe to speech service fallback notifications
  useEffect(() => {
    const unsubscribe = subscribeFallback((details) => {
      setFallbackInfo(details);
    });

    return () => {
      if (pipelineRef.current) {
        pipelineRef.current.cancel();
      }
      stopSpeech();
      stopListening();
      unsubscribe();
    };
  }, []);

  const handleProcessVoiceInput = async (spokenText, inputMode = 'voice') => {
    if (!spokenText || spokenText.trim().length === 0) return;

    logActivityEvent(inputMode === 'chat' ? 'chat' : 'voice_query');

    // Cancel any ongoing audio output
    if (pipelineRef.current) {
      pipelineRef.current.cancel();
    }
    stopSpeech();

    const logger = new LatencyLogger(spokenText);
    setIsProcessing(true);
    setTranscript(spokenText);
    setAiResponse('');

    const ttsPipeline = new TTSPipeline(selectedLanguage, {
      rate: 0.9,
      pitch: 1.0,
      onFirstAudio: () => {
        logger.markTTSFirstAudio();
      },
      onEnd: () => {
        logger.markTTSDone();
        logger.printSummary();
      },
    });
    pipelineRef.current = ttsPipeline;

    // Pre-cache canned filler ("One moment, please...") if no token within 1.5s
    let firstTokenReceived = false;
    const fillerTimer = setTimeout(() => {
      if (!firstTokenReceived && speechEnabled && isSpeechSynthesisSupported()) {
        const fillerText = getTranslation('thinkingFiller', selectedLanguage) || 'One moment, please...';
        speak(fillerText, selectedLanguage, { rate: 0.9, pitch: 1.0 });
      }
    }, FILLER_TIMEOUT_MS);

    try {
      const { intent, reply, fastPath, error: voiceError } = await handleVoice(spokenText, {
        lang: selectedLanguage,
        logger,
        onToken: (token, accumulated) => {
          setAiResponse(accumulated);
        },
        onFirstToken: () => {
          firstTokenReceived = true;
          clearTimeout(fillerTimer);
          setIsProcessing(false);
        },
        onSentence: (sentence) => {
          if (speechEnabled && isSpeechSynthesisSupported()) {
            ttsPipeline.enqueue(sentence);
          }
        },
      });

      if (voiceError) {
        const errStatus = voiceError?.status || voiceError?.statusCode || 'UNKNOWN_STATUS';
        const errMsg = voiceError?.message || String(voiceError);
        console.error(
          `[SeniorVoiceAssistant] Voice generation fallback activated - Status: ${errStatus}, Message: ${errMsg}`,
          voiceError
        );
      }

      clearTimeout(fillerTimer);
      setAiResponse(reply);

      if (onAssistantResponse) {
        onAssistantResponse({ prompt: spokenText, response: reply, intent });
      }

      // Contextual UI actions triggered off classified intent
      if (intent === 'emergency') {
        const sosButton = document.querySelector('button[aria-label*="Emergency"]');
        const sosSection = document.getElementById('emergency-heading');
        const target = sosButton || sosSection;
        if (target) {
          target.scrollIntoView({ behavior: 'smooth', block: 'center' });
          target.classList.add('ring-8', 'ring-crimsonAlert-400', 'animate-pulse');
          setTimeout(() => {
            target.classList.remove('ring-8', 'ring-crimsonAlert-400', 'animate-pulse');
          }, 3500);
        }

        // Keep SOS path working: dispatch email alert to caregiver
        logSosTriggered({ source: 'voice' });
        sendEmergencyEmailAlert({
          seniorName: 'Eleanor Vance',
          emergencyType: 'Voice SOS Intent: ' + spokenText,
          location: 'Home Console - Living Room',
          customNote: 'Senior stated: "' + spokenText + '". Assistant replied: "' + reply + '"',
        }).catch((alertErr) => {
          console.warn('[SeniorVoiceAssistant] Caregiver alert dispatch note:', alertErr);
        });
      } else if (intent === 'medication') {
        const medSection = document.getElementById('medications-heading');
        if (medSection) {
          medSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
          medSection.classList.add('ring-4', 'ring-emeraldSuccess-400');
          setTimeout(() => {
            medSection.classList.remove('ring-4', 'ring-emeraldSuccess-400');
          }, 3500);
        }
      }

      // If speech is disabled or synthesis not supported, mark done
      if (!speechEnabled || !isSpeechSynthesisSupported()) {
        logger.markTTSDone();
        logger.printSummary();
      }
    } catch (error) {
      clearTimeout(fillerTimer);
      if (pipelineRef.current) pipelineRef.current.cancel();
      console.error('Error generating AI voice response:', error);
      const fallback = 'I am listening. Please speak again whenever you are ready.';
      setAiResponse(fallback);
      if (speechEnabled && isSpeechSynthesisSupported()) {
        await speak(fallback, selectedLanguage, { rate: 0.9, pitch: 1.0 });
      }
      logger.printSummary();
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

    if (pipelineRef.current) {
      pipelineRef.current.cancel();
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
          await handleProcessVoiceInput(result.transcript, 'voice');
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

  useImperativeHandle(ref, () => ({
    toggleListening,
  }));

  const handleManualSubmit = async (e) => {
    if (e) e.preventDefault();
    if (!manualInputText.trim() || isProcessing) return;

    const query = manualInputText.trim();
    setManualInputText('');
    await submitManualInput(query, (text) => handleProcessVoiceInput(text, 'chat'));
  };

  const handleQuickPrompt = async (promptText) => {
    if (isProcessing) return;
    await submitManualInput(promptText, (text) => handleProcessVoiceInput(text, 'chat'));
  };

  const toggleSpeechAudio = () => {
    const nextState = !speechEnabled;
    setSpeechEnabled(nextState);
    if (!nextState) {
      if (pipelineRef.current) {
        pipelineRef.current.cancel();
      }
      stopSpeech();
    }
  };

  const isSttAvailable = isSpeechRecognitionSupported() && !fallbackInfo.active;

  return (
    <div className="bg-warmWhite-paper border-3 border-elderBlue-200 rounded-3xl p-4 sm:p-8 shadow-xl min-w-0">
      {/* Top Controls: Language and Speech Output */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center justify-between gap-3 sm:gap-4 pb-5 border-b-2 border-elderBlue-100 min-w-0">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0 w-full sm:w-auto">
          <Globe className="w-7 h-7 text-elderBlue-700 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
          <label htmlFor="language-select" className="text-lg sm:text-xl font-bold text-elderBlue-900">
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
            className="w-full sm:w-auto min-w-0 max-w-full min-h-[56px] px-3 sm:px-4 py-2 bg-warmWhite text-elderBlue-950 font-bold text-lg sm:text-xl border-3 border-elderBlue-300 rounded-xl focus:ring-4 focus:ring-elderBlue-400 focus:outline-none cursor-pointer"
          >
            {SUPPORTED_LANGUAGES.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.flag} {lang.native} ({lang.label})
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={toggleSpeechAudio}
          aria-label={speechEnabled ? 'Mute AI voice responses' : 'Unmute AI voice responses'}
          className="w-full sm:w-auto min-h-[56px] px-4 sm:px-5 py-3 rounded-xl border-3 border-elderBlue-400 font-bold text-lg sm:text-xl flex items-center justify-center gap-3 bg-warmWhite text-elderBlue-900 hover:bg-elderBlue-100 focus:outline-none focus:ring-4 focus:ring-elderBlue-300"
        >
          {speechEnabled ? (
            <>
              <Volume2 className="w-7 h-7 text-emeraldSuccess-700 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Voice Readout: On</span>
            </>
          ) : (
            <>
              <VolumeX className="w-7 h-7 text-crimsonAlert-700 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
              <span>Voice Readout: Off</span>
            </>
          )}
        </button>
      </div>

      {/* Main Voice Activation Button */}
      <div className="py-7 sm:py-10 flex flex-col items-center justify-center text-center">
        <button
          type="button"
          onClick={toggleListening}
          aria-label={isListening ? 'Stop listening' : 'Start speaking with assistant'}
          className={`relative w-full sm:w-auto sm:min-w-[340px] max-w-full min-h-[80px] sm:min-h-[96px] px-5 sm:px-10 py-5 sm:py-6 rounded-full font-bold text-xl sm:text-2xl flex items-center justify-center gap-3 sm:gap-4 transition-all duration-300 shadow-2xl focus:outline-none focus:ring-4 ${
            isListening
              ? 'bg-emeraldSuccess-700 text-white animate-pulse focus:ring-emeraldSuccess-300 ring-4 ring-emeraldSuccess-400'
              : 'bg-elderBlue-900 hover:bg-elderBlue-950 text-warmWhite hover:scale-[1.02] focus:ring-elderBlue-400'
          }`}
        >
          {isListening ? (
            <>
              <Mic className="w-9 h-9 sm:w-10 sm:h-10 stroke-[3] text-white flex-shrink-0" aria-hidden="true" />
              <span>{getTranslation('listening', selectedLanguage)}</span>
            </>
          ) : (
            <>
              <Mic className="w-9 h-9 sm:w-10 sm:h-10 stroke-[2.5] text-warmWhite flex-shrink-0" aria-hidden="true" />
              <span>{getTranslation('pressToSpeak', selectedLanguage)}</span>
            </>
          )}
        </button>

        <p className="mt-4 text-lg sm:text-xl text-elderBlue-800 font-semibold">
          Tap the big button above and speak naturally in your normal voice.
        </p>
      </div>

      {/* Fallback Notice Banner if STT is unavailable or errored */}
      {fallbackInfo.active && (
        <div className="mb-6 p-4 rounded-2xl bg-amber-50 border-3 border-amber-300 text-elderBlue-950 flex items-start gap-3">
          <AlertCircle className="w-7 h-7 text-amber-700 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-lg font-bold text-amber-900">Voice Input Fallback Active</p>
            <p className="text-base text-elderBlue-900 mt-1">
              {fallbackInfo.message || 'Microphone access is unavailable. You can use the manual text controls below.'}
            </p>
          </div>
        </div>
      )}

      {/* Manual Input Trigger & Quick Prompts Fallback Area */}
      <div className="mt-2 mb-6 p-4 sm:p-5 rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200 min-w-0">
        <div className="flex items-center gap-2 mb-3 text-elderBlue-800 font-bold text-lg">
          <MessageSquare className="w-5 h-5 text-elderBlue-700 flex-shrink-0" aria-hidden="true" />
          <span>Manual Input & Quick Fallback Options:</span>
        </div>

        <form onSubmit={handleManualSubmit} className="flex flex-col sm:flex-row gap-3 min-w-0">
          <input
            type="text"
            value={manualInputText}
            onChange={(e) => setManualInputText(e.target.value)}
            onFocus={(e) => {
              onInputFocusChange?.(true);
              setTimeout(() => {
                e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 150);
            }}
            onBlur={() => onInputFocusChange?.(false)}
            placeholder="Type your question or request here..."
            disabled={isProcessing}
            className="w-full min-w-0 flex-1 min-h-[56px] px-4 py-3 bg-warmWhite text-elderBlue-950 font-semibold text-lg border-2 border-elderBlue-300 rounded-xl focus:ring-4 focus:ring-elderBlue-400 focus:outline-none disabled:opacity-50 scroll-mb-24"
          />
          <button
            type="submit"
            disabled={!manualInputText.trim() || isProcessing}
            className="w-full sm:w-auto min-h-[56px] px-6 py-3 bg-elderBlue-800 hover:bg-elderBlue-900 disabled:bg-elderBlue-300 text-warmWhite font-bold text-lg rounded-xl flex items-center justify-center gap-2 transition-colors focus:ring-4 focus:ring-elderBlue-400 focus:outline-none flex-shrink-0"
          >
            <Send className="w-5 h-5 flex-shrink-0" aria-hidden="true" />
            <span>Send</span>
          </button>
        </form>

        <div className="mt-4 flex flex-col sm:flex-row sm:flex-wrap gap-2.5">
          <span className="text-base font-bold text-elderBlue-700 sm:self-center">Quick Suggestions:</span>
          <button
            type="button"
            onClick={() => handleQuickPrompt('How can I contact my family?')}
            disabled={isProcessing}
            className="min-h-[56px] px-4 py-3 bg-warmWhite hover:bg-elderBlue-100 border-2 border-elderBlue-300 rounded-xl text-base font-bold text-elderBlue-900 transition-colors text-left sm:text-center"
          >
            "How can I contact my family?"
          </button>
          <button
            type="button"
            onClick={() => handleQuickPrompt('What medications should I take today?')}
            disabled={isProcessing}
            className="min-h-[56px] px-4 py-3 bg-warmWhite hover:bg-elderBlue-100 border-2 border-elderBlue-300 rounded-xl text-base font-bold text-elderBlue-900 transition-colors text-left sm:text-center"
          >
            "What medications today?"
          </button>
          <button
            type="button"
            onClick={() => handleQuickPrompt('I need assistance right now.')}
            disabled={isProcessing}
            className="min-h-[56px] px-4 py-3 bg-warmWhite hover:bg-elderBlue-100 border-2 border-elderBlue-300 rounded-xl text-base font-bold text-elderBlue-900 transition-colors text-left sm:text-center"
          >
            "I need assistance"
          </button>
        </div>
      </div>

      {/* Spoken Text Display */}
      {(transcript || interimTranscript) && (
        <div className="mt-4 p-4 sm:p-5 rounded-2xl bg-elderBlue-50 border-3 border-elderBlue-200 min-w-0">
          <p className="text-lg font-bold text-elderBlue-700 uppercase tracking-wider">
            {isListening ? 'Listening (Speaking...)' : 'You Said:'}
          </p>
          <p className="text-xl sm:text-2xl font-bold text-elderBlue-950 mt-1 break-words">
            "{transcript || interimTranscript}"
          </p>
        </div>
      )}

      {/* Assistant Response Display */}
      <div className="mt-6 p-4 sm:p-6 rounded-2xl bg-warmWhite-card border-3 border-elderBlue-300 shadow-inner min-w-0">
        <div className="flex items-center gap-3 text-elderBlue-800 font-bold text-xl pb-2 border-b-2 border-elderBlue-100">
          <Sparkles className="w-7 h-7 text-elderBlue-600 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
          <span>ElderVoice AI Assistant:</span>
        </div>
        <p className="text-xl sm:text-2xl font-medium text-elderBlue-950 mt-4 leading-relaxed break-words">
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
});

export default SeniorVoiceAssistant;
