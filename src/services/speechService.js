/**
 * Production-Grade Fault-Tolerant Speech and Language Service
 * 
 * Provides robust, cross-browser Speech-to-Text (STT) and Text-to-Speech (TTS)
 * capabilities with dynamic locale switching (en-US, hi-IN, te-IN), elderly clarity
 * voice configuration, comprehensive error recovery, and seamless manual fallback triggers.
 */

// Supported locales with canonical BCP-47 tags
export const SUPPORTED_LOCALES = Object.freeze({
  ENGLISH: 'en-US',
  HINDI: 'hi-IN',
  TELUGU: 'te-IN',
});

// Normalized alias mappings for flexible locale detection
const LOCALE_ALIASES = Object.freeze({
  'en': SUPPORTED_LOCALES.ENGLISH,
  'en-us': SUPPORTED_LOCALES.ENGLISH,
  'en-in': 'en-IN',
  'en-gb': 'en-GB',
  'hi': SUPPORTED_LOCALES.HINDI,
  'hi-in': SUPPORTED_LOCALES.HINDI,
  'te': SUPPORTED_LOCALES.TELUGU,
  'te-in': SUPPORTED_LOCALES.TELUGU,
  'es': 'es-ES',
  'es-es': 'es-ES',
});

// Default settings optimized for elderly comprehension
export const SPEECH_CONFIG = Object.freeze({
  DEFAULT_LOCALE: SUPPORTED_LOCALES.ENGLISH,
  TTS_DEFAULT_RATE: 0.9,    // Slightly slower rate for elderly clarity
  TTS_DEFAULT_PITCH: 1.0,   // Natural pitch
  TTS_DEFAULT_VOLUME: 1.0,  // Full volume
  STT_CONTINUOUS: false,
  STT_INTERIM_RESULTS: true,
  STT_MAX_ALTERNATIVES: 1,
});

/**
 * Normalizes any locale string to an appropriate BCP-47 tag.
 * @param {string} locale
 * @returns {string}
 */
export const normalizeLocale = (locale) => {
  if (!locale || typeof locale !== 'string') {
    return SPEECH_CONFIG.DEFAULT_LOCALE;
  }
  const clean = locale.trim().replace(/_/g, '-');
  const lower = clean.toLowerCase();
  return LOCALE_ALIASES[lower] || clean;
};

// ============================================================================
// BROWSER CAPABILITY DETECTION
// ============================================================================

/**
 * Safely resolves the SpeechRecognition constructor if available.
 * @returns {typeof SpeechRecognition | null}
 */
const getSpeechRecognitionConstructor = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

/**
 * Checks whether Speech-to-Text (STT) is supported in the current environment.
 * @returns {boolean}
 */
export const isSpeechRecognitionSupported = () => {
  return Boolean(getSpeechRecognitionConstructor());
};

/**
 * Safely resolves the SpeechSynthesisUtterance constructor if available.
 * @returns {typeof SpeechSynthesisUtterance | null}
 */
const getSpeechSynthesisUtteranceConstructor = () => {
  if (typeof window !== 'undefined' && window.SpeechSynthesisUtterance) {
    return window.SpeechSynthesisUtterance;
  }
  if (typeof SpeechSynthesisUtterance !== 'undefined') {
    return SpeechSynthesisUtterance;
  }
  return null;
};

/**
 * Checks whether Text-to-Speech (TTS) is supported in the current environment.
 * @returns {boolean}
 */
export const isSpeechSynthesisSupported = () => {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    Boolean(getSpeechSynthesisUtteranceConstructor())
  );
};

// ============================================================================
// FALLBACK & MANUAL TRIGGER STATE MANAGEMENT
// ============================================================================

/**
 * @typedef {Object} FallbackState
 * @property {boolean} active - Whether manual fallback is currently recommended/active.
 * @property {string|null} reason - Error code or reason for fallback ('unsupported'|'permission_denied'|'network_error'|'audio_capture'|'manual'|null).
 * @property {string} message - User-friendly message explaining the fallback state.
 * @property {any} lastError - Raw error object or event if available.
 */

const fallbackState = {
  active: false,
  reason: null,
  message: '',
  lastError: null,
};

const fallbackListeners = new Set();

/**
 * Notifies all registered fallback listeners of state changes.
 */
const notifyFallbackListeners = () => {
  const snapshot = Object.freeze({ ...fallbackState });
  fallbackListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (listenerError) {
      console.error('[SpeechService] Fallback listener error:', listenerError);
    }
  });
};

/**
 * Returns current fallback status.
 * @returns {FallbackState}
 */
export const getFallbackDetails = () => ({ ...fallbackState });

/**
 * Checks if fallback mode is active.
 * @returns {boolean}
 */
export const isFallbackActive = () => fallbackState.active;

/**
 * Explicitly updates the fallback state and notifies all subscribers.
 * @param {boolean} active
 * @param {string|null} reason
 * @param {string} message
 * @param {any} [lastError=null]
 */
export const setFallbackActive = (active, reason = null, message = '', lastError = null) => {
  fallbackState.active = Boolean(active);
  fallbackState.reason = active ? reason : null;
  fallbackState.message = active ? message : '';
  fallbackState.lastError = active ? lastError : null;
  notifyFallbackListeners();
};

/**
 * Clears the fallback state back to normal.
 */
export const resetFallback = () => {
  setFallbackActive(false, null, '');
};

/**
 * Subscribes to fallback state changes. Returns an unsubscribe function.
 * @param {(state: FallbackState) => void} callback
 * @returns {() => void} Unsubscribe function
 */
export const subscribeFallback = (callback) => {
  if (typeof callback === 'function') {
    fallbackListeners.add(callback);
    try {
      callback(getFallbackDetails());
    } catch (err) {
      console.error('[SpeechService] Error invoking initial fallback subscriber:', err);
    }
  }
  return () => {
    fallbackListeners.delete(callback);
  };
};

/**
 * Seamless manual trigger helper for submitting fallback text input.
 * @param {string} text - The manually typed or triggered prompt.
 * @param {(text: string) => Promise<any>|any} onProcess - Handler callback that processes the input.
 * @returns {Promise<any>}
 */
export const submitManualInput = async (text, onProcess) => {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Manual input text cannot be empty.');
  }

  const cleanText = text.trim();
  if (typeof onProcess === 'function') {
    return await onProcess(cleanText);
  }
  return cleanText;
};

// ============================================================================
// TEXT-TO-SPEECH (TTS) ENGINE
// ============================================================================

let cachedVoices = [];
let voicesLoadedPromise = null;
const activeUtterances = new Set();

/**
 * Asynchronously loads and caches system voices, handling browser delays
 * via the `voiceschanged` event listener with a guaranteed resolution safety timeout.
 * @returns {Promise<SpeechSynthesisVoice[]>}
 */
export const loadVoices = () => {
  if (!isSpeechSynthesisSupported()) {
    return Promise.resolve([]);
  }

  if (cachedVoices.length > 0) {
    return Promise.resolve(cachedVoices);
  }

  if (voicesLoadedPromise) {
    return voicesLoadedPromise;
  }

  voicesLoadedPromise = new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing && existing.length > 0) {
      cachedVoices = existing;
      resolve(cachedVoices);
      return;
    }

    let timeoutId = null;

    const handleVoicesChanged = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        cachedVoices = voices;
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }
        window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
        resolve(cachedVoices);
      }
    };

    window.speechSynthesis.addEventListener('voiceschanged', handleVoicesChanged);

    // Safety timeout: If browser does not emit voiceschanged, resolve with whatever is available
    timeoutId = setTimeout(() => {
      window.speechSynthesis.removeEventListener('voiceschanged', handleVoicesChanged);
      const fallbackList = window.speechSynthesis.getVoices() || [];
      cachedVoices = fallbackList;
      resolve(cachedVoices);
    }, 1500);
  });

  return voicesLoadedPromise;
};

// Automatically initiate voice caching if in a browser environment
if (isSpeechSynthesisSupported()) {
  loadVoices().catch((err) => {
    console.warn('[SpeechService] Background voice pre-loading encountered an issue:', err);
  });
}

/**
 * Returns available voices from cache or speech synthesis.
 * @returns {SpeechSynthesisVoice[]}
 */
export const getAvailableVoices = () => {
  if (!isSpeechSynthesisSupported()) {
    return [];
  }
  if (cachedVoices.length > 0) {
    return cachedVoices;
  }
  return window.speechSynthesis.getVoices() || [];
};

/**
 * Selects the best matching native voice for the given language, with special
 * prioritizations for Hindi ('hi-IN') and Telugu ('te-IN') regional voices.
 * 
 * @param {string} targetLang - BCP-47 language tag (e.g., 'hi-IN', 'te-IN', 'en-US')
 * @param {SpeechSynthesisVoice[]} [voiceList] - Optional voice list to search from
 * @returns {SpeechSynthesisVoice|null} Best matching voice, or null if none
 */
export const getBestVoiceForLanguage = (targetLang, voiceList = null) => {
  const voices = voiceList && voiceList.length > 0 ? voiceList : getAvailableVoices();
  if (!voices || voices.length === 0) {
    return null;
  }

  const normalized = normalizeLocale(targetLang);
  const langLower = normalized.toLowerCase();
  const primaryLangCode = langLower.split('-')[0];

  // Specific keywords for regional voices in Hindi and Telugu
  const isHindi = primaryLangCode === 'hi';
  const isTelugu = primaryLangCode === 'te';

  // 1. Exact match on BCP-47 tag (e.g., voice.lang === 'hi-IN' or 'te-IN')
  const exactMatch = voices.find((v) => {
    if (!v.lang) return false;
    const vLang = v.lang.replace(/_/g, '-').toLowerCase();
    return vLang === langLower;
  });
  if (exactMatch) {
    return exactMatch;
  }

  // 2. Keyword match in voice name or voice URI (e.g., "Hindi", "Telugu", "हिन्दी", "తెలుగు")
  if (isHindi) {
    const hindiVoice = voices.find((v) => {
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      return (
        name.includes('hindi') ||
        name.includes('हिन्दी') ||
        name.includes('hemant') ||
        name.includes('kalpana') ||
        lang.includes('hi-in') ||
        lang.includes('hi_in')
      );
    });
    if (hindiVoice) return hindiVoice;
  }

  if (isTelugu) {
    const teluguVoice = voices.find((v) => {
      const name = (v.name || '').toLowerCase();
      const lang = (v.lang || '').toLowerCase();
      return (
        name.includes('telugu') ||
        name.includes('తెలుగు') ||
        name.includes('mohan') ||
        name.includes('shruti') ||
        lang.includes('te-in') ||
        lang.includes('te_in')
      );
    });
    if (teluguVoice) return teluguVoice;
  }

  // 3. Prefix match by primary language code (e.g., voice.lang starts with 'hi' or 'te' or 'en')
  const prefixMatch = voices.find((v) => {
    if (!v.lang) return false;
    const vPrimary = v.lang.replace(/_/g, '-').toLowerCase().split('-')[0];
    return vPrimary === primaryLangCode;
  });
  if (prefixMatch) {
    return prefixMatch;
  }

  // 4. Default system voice
  const defaultVoice = voices.find((v) => v.default);
  if (defaultVoice) {
    return defaultVoice;
  }

  // 5. Fallback to English voice if available
  const englishFallback = voices.find((v) => {
    if (!v.lang) return false;
    return v.lang.toLowerCase().startsWith('en');
  });
  if (englishFallback) {
    return englishFallback;
  }

  // 6. First available voice
  return voices[0] || null;
};

/**
 * Stops and cancels any active or queued speech synthesis utterances.
 */
export const stopSpeech = () => {
  if (isSpeechSynthesisSupported()) {
    try {
      window.speechSynthesis.cancel();
      activeUtterances.clear();
    } catch (cancelError) {
      console.warn('[SpeechService] Error while cancelling speech synthesis:', cancelError);
    }
  }
};

/**
 * Alias for stopSpeech to handle cancellation semantics cleanly.
 */
export const cancelSpeech = stopSpeech;

/**
 * Checks if the speech synthesis engine is currently actively speaking.
 * @returns {boolean}
 */
export const isSpeaking = () => {
  return isSpeechSynthesisSupported() && window.speechSynthesis.speaking;
};

/**
 * Speaks the provided text using the optimal native voice for the given language.
 * Enforces interruption of previous speech, rate of 0.9 for elderly clarity,
 * and pitch of 1.0. Resolves with completion details.
 * 
 * @param {string} text - Text to synthesize.
 * @param {string} [lang='en-US'] - Language locale ('en-US', 'hi-IN', 'te-IN', etc.).
 * @param {Object} [options={}] - Optional overrides for rate, pitch, volume, and callbacks.
 * @param {number} [options.rate=0.9] - Speech rate (0.1 to 10).
 * @param {number} [options.pitch=1.0] - Speech pitch (0 to 2).
 * @param {number} [options.volume=1.0] - Speech volume (0 to 1).
 * @param {() => void} [options.onStart] - Callback triggered when utterance starts speaking.
 * @param {() => void} [options.onEnd] - Callback triggered when utterance finishes.
 * @param {(error: any) => void} [options.onError] - Callback triggered on error.
 * @returns {Promise<{ success: boolean, cancelled?: boolean, error?: any }>}
 */
export const speak = async (text, lang = SPEECH_CONFIG.DEFAULT_LOCALE, options = {}) => {
  if (!isSpeechSynthesisSupported()) {
    const errorMsg = 'Text-to-Speech (speechSynthesis) is not supported in this browser.';
    console.warn(`[SpeechService] ${errorMsg}`);
    if (typeof options.onError === 'function') {
      options.onError(new Error(errorMsg));
    }
    return { success: false, error: errorMsg };
  }

  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    return { success: true, cancelled: false };
  }

  const cleanText = text.trim();
  const normalizedLang = normalizeLocale(lang);

  // 1. Interruption: cancel any existing speech to prevent overlapping audio
  stopSpeech();

  // 2. Ensure system voices are loaded before selecting
  let voices = getAvailableVoices();
  if (voices.length === 0) {
    try {
      voices = await loadVoices();
    } catch (loadErr) {
      console.warn('[SpeechService] Voice loading encountered error, continuing with fallback:', loadErr);
      voices = [];
    }
  }

  const UtteranceClass = getSpeechSynthesisUtteranceConstructor();
  if (!UtteranceClass) {
    const errorMsg = 'SpeechSynthesisUtterance constructor is unavailable in this environment.';
    console.warn(`[SpeechService] ${errorMsg}`);
    if (typeof options.onError === 'function') {
      options.onError(new Error(errorMsg));
    }
    return { success: false, error: errorMsg };
  }

  const selectedVoice = getBestVoiceForLanguage(normalizedLang, voices);

  return new Promise((resolve) => {
    try {
      const utterance = new UtteranceClass(cleanText);
      utterance.lang = normalizedLang;
      utterance.rate = typeof options.rate === 'number' ? options.rate : SPEECH_CONFIG.TTS_DEFAULT_RATE;
      utterance.pitch = typeof options.pitch === 'number' ? options.pitch : SPEECH_CONFIG.TTS_DEFAULT_PITCH;
      utterance.volume = typeof options.volume === 'number' ? options.volume : SPEECH_CONFIG.TTS_DEFAULT_VOLUME;

      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      // Chrome GC bug fix: Keep a reference to the utterance in a module-level set until finished
      activeUtterances.add(utterance);

      const cleanup = () => {
        activeUtterances.delete(utterance);
      };

      utterance.onstart = () => {
        if (typeof options.onStart === 'function') {
          try {
            options.onStart();
          } catch (callbackErr) {
            console.error('[SpeechService] TTS onStart callback error:', callbackErr);
          }
        }
      };

      utterance.onend = () => {
        cleanup();
        if (typeof options.onEnd === 'function') {
          try {
            options.onEnd();
          } catch (callbackErr) {
            console.error('[SpeechService] TTS onEnd callback error:', callbackErr);
          }
        }
        resolve({ success: true, cancelled: false });
      };

      utterance.onerror = (event) => {
        cleanup();
        // 'interrupted' or 'canceled' are expected when cancel() is triggered
        const isInterrupted = event.error === 'interrupted' || event.error === 'canceled';
        if (!isInterrupted) {
          console.warn('[SpeechService] Speech synthesis utterance error:', event.error);
        }

        if (typeof options.onError === 'function') {
          try {
            options.onError(event);
          } catch (callbackErr) {
            console.error('[SpeechService] TTS onError callback error:', callbackErr);
          }
        }

        resolve({
          success: isInterrupted,
          cancelled: isInterrupted,
          error: event.error,
        });
      };

      // Workaround for Chromium pause freeze bug: resume if synthesizer is in paused state
      if (window.speechSynthesis.paused) {
        window.speechSynthesis.resume();
      }

      window.speechSynthesis.speak(utterance);
    } catch (syncError) {
      console.error('[SpeechService] Uncaught error during speak invocation:', syncError);
      if (typeof options.onError === 'function') {
        try {
          options.onError(syncError);
        } catch (callbackErr) {
          console.error('[SpeechService] TTS onError callback error:', callbackErr);
        }
      }
      resolve({ success: false, error: syncError });
    }
  });
};

/**
 * SentenceBoundarySplitter splits streaming text tokens at sentence terminators (. ! ? \n)
 * to immediately hand off complete sentences to the TTS pipeline.
 */
export class SentenceBoundarySplitter {
  constructor(onSentence) {
    this.onSentence = onSentence;
    this.buffer = '';
  }

  push(textChunk) {
    if (!textChunk) return;
    this.buffer += textChunk;

    const sentenceEndRegex = /([.!?]+(\s+|$|\n)|\n+)/;
    let match;
    while ((match = this.buffer.match(sentenceEndRegex)) !== null) {
      const boundaryIndex = match.index + match[0].length;
      const sentence = this.buffer.slice(0, boundaryIndex).trim();
      this.buffer = this.buffer.slice(boundaryIndex);
      if (sentence && typeof this.onSentence === 'function') {
        this.onSentence(sentence);
      }
    }
  }

  flush() {
    const remaining = this.buffer.trim();
    this.buffer = '';
    if (remaining && typeof this.onSentence === 'function') {
      this.onSentence(remaining);
    }
    return remaining;
  }
}

/**
 * Pipelined Sentence-by-Sentence TTS Engine.
 * Plays the first completed sentence immediately while later tokens are still being streamed.
 */
export class TTSPipeline {
  constructor(lang = SPEECH_CONFIG.DEFAULT_LOCALE, options = {}) {
    this.lang = lang;
    this.options = options;
    this.queue = [];
    this.isSpeaking = false;
    this.isCancelled = false;
    this.firstAudioTriggered = false;
    this.onFirstAudio = options.onFirstAudio || null;
    this.onEnd = options.onEnd || null;
  }

  enqueue(sentence) {
    if (this.isCancelled || !sentence || !sentence.trim()) return;
    this.queue.push(sentence.trim());
    if (!this.isSpeaking) {
      this.playNext();
    }
  }

  async playNext() {
    if (this.isCancelled) return;
    if (this.queue.length === 0) {
      this.isSpeaking = false;
      if (typeof this.onEnd === 'function') {
        this.onEnd();
      }
      return;
    }

    this.isSpeaking = true;
    const textToSpeak = this.queue.shift();

    const startCb = () => {
      if (!this.firstAudioTriggered) {
        this.firstAudioTriggered = true;
        if (typeof this.onFirstAudio === 'function') {
          this.onFirstAudio();
        }
      }
      if (typeof this.options.onStart === 'function') {
        this.options.onStart();
      }
    };

    try {
      await speak(textToSpeak, this.lang, {
        ...this.options,
        onStart: startCb,
      });
    } catch (err) {
      console.warn('[TTSPipeline] Sentence playback error:', err);
    } finally {
      if (!this.isCancelled) {
        this.playNext();
      }
    }
  }

  cancel() {
    this.isCancelled = true;
    this.queue = [];
    this.isSpeaking = false;
    stopSpeech();
  }
}

export const createTTSPipeline = (lang, options) => new TTSPipeline(lang, options);

// ============================================================================
// SPEECH-TO-TEXT (STT) ENGINE
// ============================================================================

/**
 * Internal STT State representation.
 */
let activeRecognizer = null;
let currentSttState = 'idle'; // 'idle' | 'listening' | 'error' | 'unsupported'

/**
 * Returns current STT listening state.
 * @returns {boolean}
 */
export const isListening = () => currentSttState === 'listening';

/**
 * Returns current internal STT state string.
 * @returns {string}
 */
export const getSttState = () => currentSttState;

/**
 * Stops the current speech recognition session gracefully.
 */
export const stopListening = () => {
  if (activeRecognizer) {
    try {
      activeRecognizer.stop();
    } catch (stopErr) {
      // In case recognizer is already stopped or in transition
      try {
        activeRecognizer.abort();
      } catch (abortErr) {
        // Safe suppression of already aborted errors
      }
    }
    activeRecognizer = null;
  }
  currentSttState = 'idle';
};

/**
 * Aborts the current speech recognition session immediately.
 */
export const abortListening = () => {
  if (activeRecognizer) {
    try {
      activeRecognizer.abort();
    } catch (err) {
      // Safe suppression
    }
    activeRecognizer = null;
  }
  currentSttState = 'idle';
};

/**
 * Starts speech recognition with dynamic locale support, continuous=false,
 * interimResults=true, and maxAlternatives=1.
 * 
 * Safely handles result parsing (interim + final transcripts), error recovery
 * for 'no-speech', 'aborted', and 'network', and manages application lifecycle.
 * 
 * @param {string} [lang='en-US'] - Dynamic locale parameter ('en-US', 'hi-IN', 'te-IN', etc.).
 * @param {(result: { transcript: string, interimTranscript: string, finalTranscript: string, isFinal: boolean, confidence: number }) => void} onResultCallback - Callback passing interim and final transcripts.
 * @param {(state: 'idle'|'listening'|'error'|'unsupported', details?: any) => void} [onStateChange] - Lifecycle state tracker.
 * @param {(fallbackInfo: { reason: string, message: string, error?: any }) => void} [onFallback] - Optional callback explicitly notified when fallback is needed.
 * @returns {{ success: boolean, fallback: boolean, error?: string }}
 */
export const startListening = (
  lang = SPEECH_CONFIG.DEFAULT_LOCALE,
  onResultCallback,
  onStateChange,
  onFallback
) => {
  const SpeechRecognitionClass = getSpeechRecognitionConstructor();

  // 1. Browser compatibility check & fallback activation
  if (!SpeechRecognitionClass) {
    const message = 'Speech recognition is not supported in this browser. Please use text input or manual controls.';
    setFallbackActive(true, 'unsupported', message);

    if (typeof onFallback === 'function') {
      try {
        onFallback({ reason: 'unsupported', message });
      } catch (fbErr) {
        console.error('[SpeechService] onFallback callback error:', fbErr);
      }
    }

    if (typeof onStateChange === 'function') {
      try {
        onStateChange('unsupported', { reason: 'unsupported', message });
      } catch (scErr) {
        console.error('[SpeechService] onStateChange callback error:', scErr);
      }
    }

    return { success: false, fallback: true, error: 'unsupported' };
  }

  // 2. Safely stop any ongoing recognizer session to avoid DOMException InvalidStateError
  stopListening();

  const normalizedLang = normalizeLocale(lang);

  try {
    const recognition = new SpeechRecognitionClass();

    // Required STT configuration properties
    recognition.lang = normalizedLang;
    recognition.continuous = SPEECH_CONFIG.STT_CONTINUOUS;
    recognition.interimResults = SPEECH_CONFIG.STT_INTERIM_RESULTS;
    recognition.maxAlternatives = SPEECH_CONFIG.STT_MAX_ALTERNATIVES;

    // Track state lifecycle
    recognition.onstart = () => {
      currentSttState = 'listening';
      if (typeof onStateChange === 'function') {
        try {
          onStateChange('listening', { lang: normalizedLang });
        } catch (err) {
          console.error('[SpeechService] onStateChange error onstart:', err);
        }
      }
    };

    // Robust onresult callback passing both interim and final transcripts
    recognition.onresult = (event) => {
      let interimTranscript = '';
      let finalTranscript = '';
      let isFinal = false;
      let highestConfidence = 1.0;

      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const resultItem = event.results[i];
        if (!resultItem || !resultItem[0]) continue;

        const text = resultItem[0].transcript || '';
        if (typeof resultItem[0].confidence === 'number') {
          highestConfidence = resultItem[0].confidence;
        }

        if (resultItem.isFinal) {
          finalTranscript += text;
          isFinal = true;
        } else {
          interimTranscript += text;
        }
      }

      const activeTranscript = (finalTranscript || interimTranscript).trim();

      const resultPayload = {
        transcript: activeTranscript,
        interimTranscript: interimTranscript.trim(),
        finalTranscript: finalTranscript.trim(),
        isFinal,
        confidence: highestConfidence,
        rawEvent: event,
        // Facilitates string coercion if consumed directly
        toString() {
          return activeTranscript;
        },
      };

      if (typeof onResultCallback === 'function') {
        try {
          onResultCallback(resultPayload);
        } catch (resultErr) {
          console.error('[SpeechService] Error inside onResultCallback:', resultErr);
        }
      }
    };

    // Robust onerror event handling with specific recovery paths
    recognition.onerror = (event) => {
      const errorCode = event.error || 'unknown';

      switch (errorCode) {
        case 'no-speech': {
          // Recoverable: User remained silent during the recognition window
          currentSttState = 'idle';
          if (typeof onStateChange === 'function') {
            try {
              onStateChange('idle', {
                error: 'no-speech',
                recoverable: true,
                message: 'No speech was detected. You can tap again whenever you are ready.',
              });
            } catch (err) {
              console.error('[SpeechService] onStateChange error on no-speech:', err);
            }
          }
          break;
        }

        case 'aborted': {
          // Recoverable: Recognition was stopped intentionally or by state reset
          currentSttState = 'idle';
          if (typeof onStateChange === 'function') {
            try {
              onStateChange('idle', {
                error: 'aborted',
                recoverable: true,
                message: 'Speech recognition stopped.',
              });
            } catch (err) {
              console.error('[SpeechService] onStateChange error on aborted:', err);
            }
          }
          break;
        }

        case 'network': {
          // Unrecoverable network failure: trigger seamless manual text fallback
          currentSttState = 'error';
          const networkMsg = 'Network connectivity issue with speech recognition service. Please use text input.';
          setFallbackActive(true, 'network_error', networkMsg, event);

          if (typeof onFallback === 'function') {
            try {
              onFallback({ reason: 'network_error', message: networkMsg, error: event });
            } catch (fbErr) {
              console.error('[SpeechService] onFallback error on network failure:', fbErr);
            }
          }

          if (typeof onStateChange === 'function') {
            try {
              onStateChange('error', {
                error: 'network',
                recoverable: false,
                message: networkMsg,
              });
            } catch (err) {
              console.error('[SpeechService] onStateChange error on network failure:', err);
            }
          }
          break;
        }

        case 'not-allowed':
        case 'service-not-allowed': {
          // Permission denied: trigger manual fallback
          currentSttState = 'error';
          const permMsg = 'Microphone permission was denied. Please use text input or grant microphone access.';
          setFallbackActive(true, 'permission_denied', permMsg, event);

          if (typeof onFallback === 'function') {
            try {
              onFallback({ reason: 'permission_denied', message: permMsg, error: event });
            } catch (fbErr) {
              console.error('[SpeechService] onFallback error on permission denied:', fbErr);
            }
          }

          if (typeof onStateChange === 'function') {
            try {
              onStateChange('error', {
                error: errorCode,
                recoverable: false,
                message: permMsg,
              });
            } catch (err) {
              console.error('[SpeechService] onStateChange error on permission denied:', err);
            }
          }
          break;
        }

        case 'audio-capture': {
          // Audio hardware capture failure: trigger manual fallback
          currentSttState = 'error';
          const audioMsg = 'Microphone hardware is unavailable or not connected.';
          setFallbackActive(true, 'audio_capture', audioMsg, event);

          if (typeof onFallback === 'function') {
            try {
              onFallback({ reason: 'audio_capture', message: audioMsg, error: event });
            } catch (fbErr) {
              console.error('[SpeechService] onFallback error on audio-capture:', fbErr);
            }
          }

          if (typeof onStateChange === 'function') {
            try {
              onStateChange('error', {
                error: 'audio-capture',
                recoverable: false,
                message: audioMsg,
              });
            } catch (err) {
              console.error('[SpeechService] onStateChange error on audio capture:', err);
            }
          }
          break;
        }

        default: {
          // Generic recovery
          currentSttState = 'error';
          const genericMsg = `Speech recognition error (${errorCode}).`;
          if (typeof onStateChange === 'function') {
            try {
              onStateChange('error', {
                error: errorCode,
                recoverable: true,
                message: genericMsg,
              });
            } catch (err) {
              console.error('[SpeechService] onStateChange error on generic error:', err);
            }
          }
          break;
        }
      }
    };

    // onend lifecycle tracking
    recognition.onend = () => {
      activeRecognizer = null;
      currentSttState = 'idle';
      if (typeof onStateChange === 'function') {
        try {
          onStateChange('idle', { reason: 'ended' });
        } catch (err) {
          console.error('[SpeechService] onStateChange error onend:', err);
        }
      }
    };

    activeRecognizer = recognition;
    recognition.start();

    return { success: true, fallback: false };
  } catch (startError) {
    activeRecognizer = null;
    currentSttState = 'error';
    const errorMsg = startError?.message || 'Failed to start speech recognition.';
    console.error('[SpeechService] startListening exception:', startError);

    setFallbackActive(true, 'startup_failure', errorMsg, startError);

    if (typeof onFallback === 'function') {
      try {
        onFallback({ reason: 'startup_failure', message: errorMsg, error: startError });
      } catch (fbErr) {
        console.error('[SpeechService] onFallback error on startup failure:', fbErr);
      }
    }

    if (typeof onStateChange === 'function') {
      try {
        onStateChange('error', { error: 'startup_failure', message: errorMsg });
      } catch (err) {
        console.error('[SpeechService] onStateChange error on startup exception:', err);
      }
    }

    return { success: false, fallback: true, error: errorMsg };
  }
};

// ============================================================================
// COMPATIBILITY & UTILITY HELPERS
// ============================================================================

/**
 * Creates a configured SpeechRecognition instance adhering to legacy signatures
 * while maintaining backward-compatibility with existing application components.
 * 
 * @param {Object} options
 * @param {string} [options.language='en-US']
 * @param {boolean} [options.continuous=false]
 * @param {boolean} [options.interimResults=true]
 * @param {() => void} [options.onStart]
 * @param {() => void} [options.onEnd]
 * @param {(text: string, isFinal: boolean) => void} [options.onResult]
 * @param {(error: any) => void} [options.onError]
 * @returns {SpeechRecognition|null}
 */
export const createSpeechRecognizer = ({
  language = SPEECH_CONFIG.DEFAULT_LOCALE,
  continuous = SPEECH_CONFIG.STT_CONTINUOUS,
  interimResults = SPEECH_CONFIG.STT_INTERIM_RESULTS,
  onStart,
  onEnd,
  onResult,
  onError,
} = {}) => {
  const SpeechRecognitionClass = getSpeechRecognitionConstructor();
  if (!SpeechRecognitionClass) {
    const warnMsg = 'Speech Recognition is not supported in this browser.';
    console.warn(`[SpeechService] ${warnMsg}`);
    setFallbackActive(true, 'unsupported', warnMsg);
    return null;
  }

  const recognition = new SpeechRecognitionClass();
  recognition.lang = normalizeLocale(language);
  recognition.continuous = continuous;
  recognition.interimResults = interimResults;
  recognition.maxAlternatives = SPEECH_CONFIG.STT_MAX_ALTERNATIVES;

  recognition.onstart = () => {
    currentSttState = 'listening';
    if (typeof onStart === 'function') {
      onStart();
    }
  };

  recognition.onresult = (event) => {
    const current = event.resultIndex;
    if (event.results && event.results[current] && event.results[current][0]) {
      const transcript = event.results[current][0].transcript;
      const isFinal = Boolean(event.results[current].isFinal);
      if (typeof onResult === 'function') {
        onResult(transcript, isFinal);
      }
    }
  };

  recognition.onerror = (event) => {
    const error = event.error || 'unknown';
    if (error === 'network' || error === 'not-allowed' || error === 'audio-capture') {
      setFallbackActive(true, error, `Speech recognition failed: ${error}`, event);
    }
    if (typeof onError === 'function') {
      onError(error);
    }
  };

  recognition.onend = () => {
    currentSttState = 'idle';
    if (typeof onEnd === 'function') {
      onEnd();
    }
  };

  return recognition;
};

/**
 * Backward-compatible helper for speaking text.
 * @param {string} text
 * @param {Object} [options]
 */
export const speakText = (text, options = {}) => {
  const { language = SPEECH_CONFIG.DEFAULT_LOCALE, ...rest } = options;
  return speak(text, language, rest);
};

/**
 * Returns overall diagnostic service status.
 * @returns {Object}
 */
export const getSpeechServiceStatus = () => ({
  sttSupported: isSpeechRecognitionSupported(),
  ttsSupported: isSpeechSynthesisSupported(),
  isListening: isListening(),
  isSpeaking: isSpeaking(),
  fallbackActive: isFallbackActive(),
  fallbackDetails: getFallbackDetails(),
  availableVoicesCount: getAvailableVoices().length,
});

// Default export consolidating speech service functions
const speechService = {
  SUPPORTED_LOCALES,
  SPEECH_CONFIG,
  normalizeLocale,
  isSpeechRecognitionSupported,
  isSpeechSynthesisSupported,
  startListening,
  stopListening,
  abortListening,
  isListening,
  getSttState,
  speak,
  speakText,
  stopSpeech,
  cancelSpeech,
  isSpeaking,
  loadVoices,
  getAvailableVoices,
  getBestVoiceForLanguage,
  getFallbackDetails,
  isFallbackActive,
  setFallbackActive,
  resetFallback,
  subscribeFallback,
  submitManualInput,
  createSpeechRecognizer,
  getSpeechServiceStatus,
  TTSPipeline,
  createTTSPipeline,
  SentenceBoundarySplitter,
};

export default speechService;
