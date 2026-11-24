import { GoogleGenAI, Type } from '@google/genai';
import { SentenceBoundarySplitter } from './speechService.js';

/**
 * ----------------------------------------------------------------------------
 * 5. MODEL CONFIGURATION CONSTANTS (Configurable via ENV)
 * Primary = Gemini Flash-class (fastest available)
 * Fallback = Different, faster/smaller model
 * ----------------------------------------------------------------------------
 */
export const PRIMARY_MODEL =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_PRIMARY_MODEL) ||
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_MODEL) ||
  (typeof process !== 'undefined' && (process?.env?.VITE_GEMINI_PRIMARY_MODEL || process?.env?.VITE_GEMINI_MODEL)) ||
  'gemini-2.5-flash';

export const FALLBACK_MODEL =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_FALLBACK_MODEL) ||
  (typeof process !== 'undefined' && process?.env?.VITE_GEMINI_FALLBACK_MODEL) ||
  'gemini-2.5-flash-lite';

export const MODEL = PRIMARY_MODEL;
export const MODELS = [PRIMARY_MODEL, FALLBACK_MODEL];

export const PRIMARY_TIMEOUT_MS = Number(
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_PRIMARY_TIMEOUT_MS) ||
  (typeof process !== 'undefined' && process?.env?.VITE_PRIMARY_TIMEOUT_MS) ||
  3000
);

export const HEDGE_DELAY_MS = Number(
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_HEDGE_DELAY_MS) ||
  (typeof process !== 'undefined' && process?.env?.VITE_HEDGE_DELAY_MS) ||
  2000
);

export const FALLBACK_TIMEOUT_MS = Number(
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_FALLBACK_TIMEOUT_MS) ||
  (typeof process !== 'undefined' && process?.env?.VITE_FALLBACK_TIMEOUT_MS) ||
  5000
);

export const FILLER_TIMEOUT_MS = Number(
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_FILLER_TIMEOUT_MS) ||
  (typeof process !== 'undefined' && process?.env?.VITE_FILLER_TIMEOUT_MS) ||
  1500
);

export const MAX_OUTPUT_TOKENS = Number(
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_MAX_OUTPUT_TOKENS) ||
  (typeof process !== 'undefined' && process?.env?.VITE_MAX_OUTPUT_TOKENS) ||
  100
);

/**
 * ----------------------------------------------------------------------------
 * 10. SINGLE PERSISTENT HTTP CLIENT INSTANCE (Connection Reuse)
 * ----------------------------------------------------------------------------
 */
const getApiKey = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_API_KEY) {
      return import.meta.env.VITE_GEMINI_API_KEY;
    }
  } catch (_) {}

  if (typeof process !== 'undefined' && process?.env) {
    return process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  }
  return '';
};

let persistentAiClient = null;

export const getPersistentClient = () => {
  if (persistentAiClient) return persistentAiClient;
  const currentKey = getApiKey();
  if (!currentKey) {
    console.warn('[geminiService] VITE_GEMINI_API_KEY is not defined.');
    return null;
  }
  try {
    persistentAiClient = new GoogleGenAI({ apiKey: currentKey });
    return persistentAiClient;
  } catch (err) {
    console.error('[geminiService] Failed to initialize persistent GoogleGenAI client:', err);
    return null;
  }
};

export const getClient = getPersistentClient;

/**
 * ----------------------------------------------------------------------------
 * 8. CIRCUIT BREAKER
 * If primary model fails or times out 3 times in 60 seconds,
 * skip it for the next 2 minutes and route directly to fallback.
 * ----------------------------------------------------------------------------
 */
export class CircuitBreaker {
  constructor(threshold = 3, windowMs = 60000, cooldownMs = 120000) {
    this.threshold = threshold;
    this.windowMs = windowMs;
    this.cooldownMs = cooldownMs;
    this.failures = [];
    this.state = 'CLOSED'; // 'CLOSED' | 'OPEN' | 'HALF_OPEN'
    this.openUntil = 0;
  }

  isOpen() {
    const now = Date.now();
    if (this.state === 'OPEN') {
      if (now >= this.openUntil) {
        this.state = 'HALF_OPEN';
        console.info('[CircuitBreaker] 2-minute cooldown expired. State -> HALF_OPEN (probing primary).');
        return false;
      }
      return true;
    }
    return false;
  }

  recordFailure(modelName, error) {
    const now = Date.now();
    this.failures.push(now);
    this.failures = this.failures.filter((t) => now - t <= this.windowMs);

    console.warn(
      `[CircuitBreaker] Failure on ${modelName} (${this.failures.length}/${this.threshold} in last ${this.windowMs / 1000}s):`,
      error?.message || error
    );

    if (this.failures.length >= this.threshold || this.state === 'HALF_OPEN') {
      this.state = 'OPEN';
      this.openUntil = now + this.cooldownMs;
      console.warn(
        `[CircuitBreaker] TRIPPED! Skipping primary (${modelName}) for 2 minutes until ${new Date(this.openUntil).toLocaleTimeString()}.`
      );
    }
  }

  recordSuccess(modelName) {
    if (this.state === 'HALF_OPEN') {
      console.info(`[CircuitBreaker] Primary probe succeeded for ${modelName}. Circuit reset to CLOSED.`);
      this.state = 'CLOSED';
      this.failures = [];
      this.openUntil = 0;
    }
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = [];
    this.openUntil = 0;
  }
}

export const primaryCircuitBreaker = new CircuitBreaker();

/**
 * ----------------------------------------------------------------------------
 * 6. SESSION CONTEXT CACHE & RELEVANT SUBSET INJECTION
 * Load contacts/meds context once at session start; do not rebuild per call.
 * Only inject the minimal relevant subset to keep prompt short.
 * ----------------------------------------------------------------------------
 */
let cachedSessionContext = null;

export const loadSessionContext = () => {
  if (cachedSessionContext) return cachedSessionContext;

  let profile = {
    fullName: 'Eleanor Vance',
    preferredName: 'Ellie',
    emergencyContacts: [
      { name: 'Sarah Vance', relationship: 'Daughter (Primary Carer)', phone: '(555) 912-3456' },
      { name: 'Michael Vance', relationship: 'Son', phone: '(555) 876-5432' },
    ],
    familyMembers: [
      { name: 'Sarah', relationship: 'Daughter', note: 'Visits every Sunday afternoon with grandson Leo.' },
      { name: 'Michael', relationship: 'Son', note: 'Lives in Seattle, calls on Wednesday evenings.' },
      { name: 'Arthur Vance', relationship: 'Late Husband', note: 'Married for 48 years; loved ballroom dancing.' },
    ],
    doctor: 'Dr. Robert Chen, MD ((555) 234-8900)',
  };

  let medications = [
    { name: 'Lisinopril', dosage: '10mg', scheduleTime: '08:00', status: 'confirmed' },
    { name: 'Metformin', dosage: '500mg', scheduleTime: '13:00', status: 'pending' },
    { name: 'Atorvastatin', dosage: '20mg', scheduleTime: '20:00', status: 'pending' },
  ];

  try {
    if (typeof localStorage !== 'undefined') {
      const p = localStorage.getItem('eldervoice_profile_data');
      if (p) {
        const parsed = JSON.parse(p);
        profile.fullName = parsed.fullName || profile.fullName;
        profile.preferredName = parsed.preferredName || profile.preferredName;
        if (parsed.emergencyContacts?.length) profile.emergencyContacts = parsed.emergencyContacts;
        if (parsed.memoryVault?.familyMembers?.length) profile.familyMembers = parsed.memoryVault.familyMembers;
        if (parsed.medicalNotes?.primaryPhysician) profile.doctor = parsed.medicalNotes.primaryPhysician;
      }
      const m = localStorage.getItem('eldervoice_medications_data');
      if (m) {
        const parsedMeds = JSON.parse(m);
        if (Array.isArray(parsedMeds) && parsedMeds.length > 0) medications = parsedMeds;
      }
    }
  } catch (_) {}

  cachedSessionContext = { profile, medications };
  return cachedSessionContext;
};

export const updateCachedContext = (partial) => {
  if (!cachedSessionContext) cachedSessionContext = loadSessionContext();
  Object.assign(cachedSessionContext, partial);
};

export const getRelevantContextSubset = (query = '') => {
  const ctx = loadSessionContext();
  const q = query.toLowerCase();

  if (/\b(med|meds|medicine|medicines|pill|pills|prescription|dosage|take|taken)\b/i.test(q)) {
    const list = ctx.medications
      .map((m) => `${m.name} (${m.dosage || ''}) [${m.status === 'confirmed' ? 'Taken' : 'Pending'}]`)
      .join(', ');
    return `[Medications: ${list}]`;
  }

  if (/\b(family|daughter|son|sarah|michael|husband|arthur|call|contact|reach|phone)\b/i.test(q)) {
    const fam = ctx.profile.familyMembers.map((f) => `${f.name} (${f.relationship})`).join(', ');
    const contacts = ctx.profile.emergencyContacts.map((c) => `${c.name} ${c.phone}`).join(', ');
    return `[Family: ${fam}. Contacts: ${contacts}]`;
  }

  if (/\b(doctor|physician|chen|appointment|clinic)\b/i.test(q)) {
    return `[Primary Doctor: ${ctx.profile.doctor}]`;
  }

  return '';
};

/**
 * Shortened strict system prompt (capping reply to 1-2 spoken sentences)
 */
export const SYSTEM_PROMPT =
  'You are ElderVoice AI, a caring voice assistant for senior Eleanor. Reply in 1-2 short, spoken sentences. Be warm, comforting, and direct. Never use markdown, bullet points, or jargon.';

export const SYSTEM = SYSTEM_PROMPT; // Backward compatibility alias

/**
 * ----------------------------------------------------------------------------
 * 7. FAST-PATH (NO LLM): Rule/Keyword Intents from Local DB
 * ----------------------------------------------------------------------------
 */
export const EMERGENCY_WORDS =
  /\b(help|emergency|urgent|right now|chest pain|can'?t breathe|cannot breathe|fell|fallen|ambulance|danger|sos)\b|बचाओ|मदद|सहायता|సహాయం|అత్యవసరం/i;

export const checkFastPath = (transcript = '', lang = 'en-US') => {
  if (!transcript || typeof transcript !== 'string') return null;
  const clean = transcript.trim();
  const lower = clean.toLowerCase();

  // 1. Time / Date queries (check first so "what time is it right now" doesn't false-trigger on "right now")
  const isTimeQuery = /\b(what('?s| is) the time|what time is it|what time it is|tell me the time)\b/i.test(lower);
  const isDateQuery = /\b(what('?s| is) (the |today'?s )?date|what day is (it|today)|what's today'?s date)\b/i.test(lower);

  if (isTimeQuery || isDateQuery) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    let reply = '';
    if (isTimeQuery && isDateQuery) {
      reply = `It is currently ${timeStr} on ${dateStr}.`;
    } else if (isTimeQuery) {
      reply = `It is currently ${timeStr}.`;
    } else {
      reply = `Today is ${dateStr}.`;
    }

    return {
      handled: true,
      intent: 'time_date',
      reply,
      actionTrigger: { type: 'NONE', targetId: null },
    };
  }

  // 2. SOS / Emergency rule: answer immediately from DB + trigger caregiver alert
  if (EMERGENCY_WORDS.test(clean)) {
    let reply =
      'Emergency alert activated. Calling your daughter Sarah and alerting your caregiver right now. Please sit down and stay calm.';
    if (lang.startsWith('hi')) {
      reply = 'आपातकालीन सहायता (SOS) सक्रिय हो गई है। आपके परिवार को सूचित किया जा रहा है। कृपया शांत होकर बैठें।';
    } else if (lang.startsWith('te')) {
      reply = 'అత్యవసర సహాయం (SOS) ప్రారంభించబడింది. మీ కుమార్తె సారాకు మరియు సంరక్షకులకు వెంటనే తెలియజేస్తున్నాము.';
    }

    return {
      handled: true,
      intent: 'emergency',
      reply,
      actionTrigger: { type: 'TRIGGER_ALERT', targetId: 'sos' },
    };
  }

  const ctx = loadSessionContext();

  // 2. "did I take my medicine" rule
  if (
    /\b(did i take|have i taken|did i have|did i miss|have i had)\s+(my\s+)?(med|meds|medicine|medicines|pill|pills|medication|medications)\b/i.test(
      lower
    ) ||
    /\b(what|which)\s+(med|meds|medicine|medicines|pill|pills|medication|medications)\s+(did i take|have i taken|taken today)\b/i.test(
      lower
    )
  ) {
    const meds = ctx.medications || [];
    const taken = meds.filter((m) => m.status === 'confirmed').map((m) => m.name);
    const pending = meds.filter((m) => m.status !== 'confirmed').map((m) => m.name);

    let reply = '';
    if (taken.length > 0 && pending.length > 0) {
      reply = `You have already taken your ${taken.join(', ')} today. Your ${pending.join(', ')} is still scheduled for later.`;
    } else if (taken.length > 0 && pending.length === 0) {
      reply = `Yes, you have already taken all of your scheduled medications today: ${taken.join(', ')}.`;
    } else if (pending.length > 0) {
      reply = `You haven't taken your medications yet today. Your ${pending.join(', ')} is currently pending.`;
    } else {
      reply = 'You have no scheduled medications recorded for today.';
    }

    return {
      handled: true,
      intent: 'medication',
      reply,
      actionTrigger: { type: 'CONFIRM_MEDICATION', targetId: null },
    };
  }

  // 4. "who is <name>" rule
  const whoMatch = lower.match(/\bwho (is|was|'s)\s+([a-zA-Z\s.]+?)(?:\?|$)/i);
  if (whoMatch) {
    const targetName = whoMatch[2].trim().toLowerCase();
    const fam = ctx.profile.familyMembers || [];
    const matchedFamily = fam.find(
      (f) => targetName.includes(f.name.toLowerCase()) || f.name.toLowerCase().includes(targetName)
    );

    if (matchedFamily) {
      return {
        handled: true,
        intent: 'memory_vault',
        reply: `${matchedFamily.name} is your ${matchedFamily.relationship}. ${matchedFamily.note || ''}`.trim(),
        actionTrigger: { type: 'NONE', targetId: null },
      };
    }

    if (targetName.includes('doctor') || targetName.includes('chen')) {
      return {
        handled: true,
        intent: 'appointment',
        reply: `${ctx.profile.doctor} is your primary physician.`,
        actionTrigger: { type: 'NONE', targetId: null },
      };
    }
  }

  return null;
};

/**
 * ----------------------------------------------------------------------------
 * 9. LATENCY LOGGER
 * Timestamp each stage (STT done, LLM first token, LLM done, TTS first audio)
 * and log ms per stage + which model answered.
 * ----------------------------------------------------------------------------
 */
export class LatencyLogger {
  constructor(input = '') {
    this.requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    this.input = input;
    this.t_stt_done = Date.now();
    this.t_fastpath = null;
    this.t_llm_start = null;
    this.t_llm_first_token = null;
    this.t_llm_done = null;
    this.t_tts_first_audio = null;
    this.t_tts_done = null;
    this.modelAnswered = 'None';
    this.isFastPath = false;
    this.hedgedFired = false;
    this.summaryPrinted = false;
  }

  markFastPath(intent) {
    this.t_fastpath = Date.now();
    this.isFastPath = true;
    this.modelAnswered = `Fast-Path (${intent})`;
  }

  markLLMStart() {
    this.t_llm_start = Date.now();
  }

  markLLMFirstToken(model) {
    if (!this.t_llm_first_token) {
      this.t_llm_first_token = Date.now();
      this.modelAnswered = model;
    }
  }

  markLLMDone() {
    this.t_llm_done = Date.now();
  }

  markTTSFirstAudio() {
    if (!this.t_tts_first_audio) {
      this.t_tts_first_audio = Date.now();
    }
  }

  markTTSDone() {
    this.t_tts_done = Date.now();
  }

  printSummary() {
    if (this.summaryPrinted) return;
    this.summaryPrinted = true;

    const stt = this.t_stt_done;
    const ttft = this.t_llm_first_token
      ? `${(this.t_llm_first_token - stt).toFixed(1)} ms`
      : this.isFastPath
      ? '0.0 ms (Instant Fast-Path)'
      : 'N/A';
    const ttfa = this.t_tts_first_audio ? `${(this.t_tts_first_audio - stt).toFixed(1)} ms` : 'N/A';
    const llmGen =
      this.t_llm_done && this.t_llm_first_token
        ? `${(this.t_llm_done - this.t_llm_first_token).toFixed(1)} ms`
        : 'N/A';
    const total = ((this.t_tts_done || Date.now()) - stt).toFixed(1);

    console.group(`%c[ElderVoice Latency Summary] ${this.requestId}`, 'color: #059669; font-weight: bold;');
    console.log(`Prompt: "${this.input}"`);
    console.log(`Path: ${this.isFastPath ? '⚡ Fast-Path (No LLM)' : '🤖 LLM Streaming'}`);
    console.log(`Model Answered: ${this.modelAnswered}`);
    if (this.hedgedFired) console.log('Hedged Request: FIRED (Fallback won parallel race)');
    if (this.isFastPath) {
      console.log(`Fast-Path Instant Lookup: ${(this.t_fastpath - stt).toFixed(2)} ms`);
    } else {
      console.log(`STT Done -> First Token (TTFT): ${ttft}`);
      console.log(`LLM Stream Generation:          ${llmGen}`);
    }
    console.log(`STT Done -> First Audio (TTFA): ${ttfa}`);
    console.log(`Total End-to-End Latency:       ${total} ms`);
    console.groupEnd();

    return {
      requestId: this.requestId,
      input: this.input,
      model: this.modelAnswered,
      isFastPath: this.isFastPath,
      hedgedFired: this.hedgedFired,
      ttft: this.t_llm_first_token ? this.t_llm_first_token - stt : 0,
      ttfa: this.t_tts_first_audio ? this.t_tts_first_audio - stt : 0,
      total: Number(total),
    };
  }
}

/**
 * ----------------------------------------------------------------------------
 * 1, 2, 3, 4. STREAMING GENERATION WITH HARD TIMEOUT, HEDGED REQUEST,
 * AND SENTENCE-BOUNDARY PIPELINING
 * ----------------------------------------------------------------------------
 */
export async function streamWithHedgeAndTimeout({
  prompt,
  systemInstruction = SYSTEM_PROMPT,
  onToken,
  onSentence,
  onFirstToken,
  logger,
}) {
  const client = getPersistentClient();
  if (!client) {
    throw new Error('[geminiService] Cannot initialize client: API key missing.');
  }

  const splitter = new SentenceBoundarySplitter((s) => {
    if (typeof onSentence === 'function') onSentence(s);
  });

  const runModelStream = async (modelName, abortController) => {
    const stream = await client.models.generateContentStream({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.2,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        abortSignal: abortController.signal,
      },
    });

    let fullText = '';
    let isFirst = true;

    for await (const chunk of stream) {
      if (abortController.signal.aborted) break;
      const text = chunk.text || '';
      if (!text) continue;

      if (isFirst) {
        isFirst = false;
        if (typeof onFirstToken === 'function') onFirstToken(modelName);
      }

      fullText += text;
      splitter.push(text);
      if (typeof onToken === 'function') onToken(text, fullText);
    }

    splitter.flush();
    return { text: fullText, model: modelName };
  };

  // 1. Check Circuit Breaker
  if (primaryCircuitBreaker.isOpen()) {
    console.warn(
      `[CircuitBreaker] Primary model (${PRIMARY_MODEL}) is OPEN. Routing request directly to fallback (${FALLBACK_MODEL}).`
    );
    const fallbackController = new AbortController();
    const fallbackTimeout = setTimeout(() => fallbackController.abort(), FALLBACK_TIMEOUT_MS);
    try {
      if (logger) logger.markLLMStart();
      const res = await runModelStream(FALLBACK_MODEL, fallbackController);
      clearTimeout(fallbackTimeout);
      if (logger) {
        logger.markLLMFirstToken(FALLBACK_MODEL);
        logger.markLLMDone();
      }
      return res;
    } catch (fbErr) {
      clearTimeout(fallbackTimeout);
      throw fbErr;
    }
  }

  // 2. Normal Flow: Primary with 3s hard timeout & 2s hedged request
  if (logger) logger.markLLMStart();
  const primaryController = new AbortController();
  let fallbackController = null;
  let primaryFirstTokenArrived = false;
  let fallbackFirstTokenArrived = false;

  let primaryTimeoutId = null;
  let hedgeTimeoutId = null;
  let fallbackTimeoutId = null;

  return new Promise((resolve, reject) => {
    let resolved = false;

    const cleanup = () => {
      if (primaryTimeoutId) clearTimeout(primaryTimeoutId);
      if (hedgeTimeoutId) clearTimeout(hedgeTimeoutId);
      if (fallbackTimeoutId) clearTimeout(fallbackTimeoutId);
    };

    const handleSuccess = (result) => {
      if (resolved) return;
      resolved = true;
      cleanup();

      if (result.model === PRIMARY_MODEL) {
        primaryCircuitBreaker.recordSuccess(PRIMARY_MODEL);
        if (fallbackController) fallbackController.abort();
      } else {
        if (primaryController) primaryController.abort();
      }

      if (logger) logger.markLLMDone();
      resolve(result);
    };

    const triggerFallback = () => {
      if (fallbackController || resolved) return;
      console.info(`[HedgedRequest] 2s elapsed with no 1st token. Firing fallback (${FALLBACK_MODEL}) in parallel.`);
      if (logger) logger.hedgedFired = true;

      fallbackController = new AbortController();
      fallbackTimeoutId = setTimeout(() => {
        if (!resolved && !fallbackFirstTokenArrived) {
          fallbackController.abort();
        }
      }, FALLBACK_TIMEOUT_MS);

      runModelStream(FALLBACK_MODEL, fallbackController)
        .then((result) => {
          if (!resolved) {
            handleSuccess(result);
          }
        })
        .catch((err) => {
          if (!resolved && !primaryFirstTokenArrived) {
            cleanup();
            reject(err);
          }
        });
    };

    // 2. Hedged request: If primary has no 1st token by 2s, fire fallback in parallel
    hedgeTimeoutId = setTimeout(() => {
      if (!primaryFirstTokenArrived && !resolved) {
        triggerFallback();
      }
    }, HEDGE_DELAY_MS);

    // 1. Timeout: Primary model call gets 3s hard timeout. On timeout -> switch to fallback immediately.
    primaryTimeoutId = setTimeout(() => {
      if (!primaryFirstTokenArrived && !resolved) {
        console.warn(`[Timeout] Primary model (${PRIMARY_MODEL}) hit 3s hard timeout. Aborting.`);
        primaryController.abort();
        primaryCircuitBreaker.recordFailure(PRIMARY_MODEL, new Error('3s Primary Timeout'));
        if (!fallbackController) {
          triggerFallback();
        }
      }
    }, PRIMARY_TIMEOUT_MS);

    // Run Primary Model Stream
    runModelStream(PRIMARY_MODEL, primaryController)
      .then((result) => {
        primaryFirstTokenArrived = true;
        if (!resolved) {
          handleSuccess(result);
        }
      })
      .catch((err) => {
        primaryCircuitBreaker.recordFailure(PRIMARY_MODEL, err);
        console.warn(
          `[PrimaryFailure] Model '${PRIMARY_MODEL}' failed (${err?.message || err}). Switching immediately to fallback without retries.`
        );
        if (!fallbackController && !resolved) {
          triggerFallback();
        } else if (!resolved && fallbackFirstTokenArrived) {
          // Fallback will fulfill
        } else if (!resolved) {
          cleanup();
          reject(err);
        }
      });
  });
}

/**
 * ----------------------------------------------------------------------------
 * MAIN VOICE HANDLER: Fast-path -> LLM Streaming + sentence pipelining
 * ----------------------------------------------------------------------------
 */
export async function handleVoice(transcript, options = {}) {
  const {
    onToken,
    onSentence,
    onFirstToken,
    logger = new LatencyLogger(transcript),
    lang = 'en-US',
  } = options;

  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return {
      intent: 'unknown',
      reply: REPLIES.unknown.en,
      actionTrigger: { type: 'NONE', targetId: null },
      fastPath: true,
      logger,
    };
  }

  const cleanText = transcript.trim();

  // 1. FAST-PATH (No LLM): Check rules/keywords
  const fastPathResult = checkFastPath(cleanText, lang);
  if (fastPathResult) {
    logger.markFastPath(fastPathResult.intent);
    if (typeof onSentence === 'function') {
      onSentence(fastPathResult.reply);
    }
    if (typeof onToken === 'function') {
      onToken(fastPathResult.reply, fastPathResult.reply);
    }
    return {
      intent: fastPathResult.intent,
      reply: fastPathResult.reply,
      actionTrigger: fastPathResult.actionTrigger || { type: 'NONE', targetId: null },
      fastPath: true,
      logger,
    };
  }

  // 2. LLM Path: Inject minimal relevant context subset
  const relevantContext = getRelevantContextSubset(cleanText);
  const promptWithContext = relevantContext
    ? `${relevantContext}\nUser prompt: "${cleanText}"`
    : cleanText;

  try {
    const result = await streamWithHedgeAndTimeout({
      prompt: promptWithContext,
      systemInstruction: SYSTEM_PROMPT,
      onToken,
      onSentence,
      onFirstToken: (model) => {
        logger.markLLMFirstToken(model);
        if (typeof onFirstToken === 'function') onFirstToken(model);
      },
      logger,
    });

    return {
      intent: 'assistant_response',
      reply: result.text,
      model: result.model,
      actionTrigger: { type: 'NONE', targetId: null },
      fastPath: false,
      logger,
    };
  } catch (err) {
    console.error('[geminiService] LLM stream failed or timed out:', err);

    // Guaranteed SOS path: even if both models fail, trigger emergency alert & safe reply
    if (EMERGENCY_WORDS.test(cleanText)) {
      const emergencyReply =
        'Emergency alert activated. Calling your daughter Sarah and alerting your caregiver right now. Please sit down and stay calm.';
      if (typeof onSentence === 'function') onSentence(emergencyReply);
      return {
        intent: 'emergency',
        reply: emergencyReply,
        actionTrigger: { type: 'TRIGGER_ALERT', targetId: 'sos' },
        error: err,
        logger,
      };
    }

    const fallbackReply = REPLIES.unknown.en;
    if (typeof onSentence === 'function') onSentence(fallbackReply);
    return {
      intent: 'unknown',
      reply: fallbackReply,
      actionTrigger: { type: 'NONE', targetId: null },
      error: err,
      logger,
    };
  }
}

/**
 * Backward compatibility adapter for legacy callWithFallback callers.
 */
export async function callWithFallback(params) {
  const client = getPersistentClient();
  if (!client) {
    throw new Error('[geminiService] Cannot initialize client: API key missing.');
  }

  let lastError;
  for (const m of MODELS) {
    try {
      return await client.models.generateContent({ ...params, model: m });
    } catch (err) {
      lastError = err;
      const status = Number(err?.status ?? err?.response?.status ?? err?.statusCode);
      if (status === 429 || status === 500 || status === 503 || status === 404) {
        console.warn(`[geminiService] Model ${m} failed with status ${status}:`, err.message || err);
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

/**
 * Backward compatibility adapter for processVoiceCommand callers.
 */
export async function processVoiceCommand(transcript) {
  const result = await handleVoice(transcript);
  return {
    intent: result.intent,
    replyText: result.reply,
    actionTrigger: result.actionTrigger || {
      type: result.intent === 'emergency' ? 'TRIGGER_ALERT' : result.intent === 'medication' ? 'CONFIRM_MEDICATION' : 'NONE',
      targetId: null,
    },
  };
}

/**
 * Backward compatibility static replies & definitions
 */
export const INTENTS = [
  'medication',
  'emergency',
  'call_family',
  'appointment',
  'symptom',
  'greeting',
  'unknown',
];

export const REPLIES = {
  medication: {
    en: 'Please refer to the daily medication schedule section.',
    hi: 'कृपया दैनिक दवाई वाला अनुभाग देखें।',
    te: 'దయచేసి రోజువారీ మందుల విభాగాన్ని చూడండి.',
  },
  emergency: {
    en: 'Emergency alert activated. Calling your daughter Sarah and alerting your caregiver right now. Please sit down and stay calm.',
    hi: 'आपातकालीन सहायता (SOS) सक्रिय हो गई है। आपके परिवार को सूचित किया जा रहा है।',
    te: 'అత్యవసర సహాయం (SOS) ప్రారంభించబడింది. మీ కుటుంబ సభ్యులకు వెంటనే తెలియజేస్తున్నాము.',
  },
  call_family: {
    en: 'You can call your daughter Sarah at (555) 912-3456 or press SOS to alert family.',
    hi: 'आप अपनी बेटी सारा को (555) 912-3456 पर कॉल कर सकते हैं या SOS दबाएं।',
    te: 'మీరు మీ కుమార్తె సారాకు (555) 912-3456 నంబర్‌లో కాల్ చేయవచ్చు లేదా SOS నొక్కండి.',
  },
  appointment: {
    en: 'Please check your upcoming appointments in the schedule section.',
    hi: 'कृपया शेड्यूल अनुभाग में अपनी आगामी अपॉइंटमेंट देखें।',
    te: 'దయచేసి షెడ్యూల్ విభాగంలో మీ రాబోయే అపాయింట్‌మెంట్‌లను తనిఖీ చేయండి.',
  },
  symptom: {
    en: 'Please consult your doctor immediately regarding any discomfort. Do not change medications on your own.',
    hi: 'कृपया किसी भी परेशानी के लिए तुरंत अपने डॉक्टर से संपर्क करें।',
    te: 'ఏదైనా అసౌకర్యం ఉంటే వెంటనే మీ వైద్యుడిని సంప్రదించండి.',
  },
  greeting: {
    en: 'Hello Eleanor! I am right here with you. How can I help you today?',
    hi: 'नमस्ते एलेनोर! मैं आपके साथ यहीं हूँ। आज मैं आपकी क्या मदद कर सकता हूँ?',
    te: 'నమస్కారం ఎలియనోర్! నేను మీతోనే ఉన్నాను. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?',
  },
  unknown: {
    en: 'I am listening. Please speak again whenever you are ready.',
    hi: 'मैं सुन रहा हूँ। जब भी आप तैयार हों, कृपया फिर से बोलें।',
    te: 'నేను వింటున్నాను. మీరు సిద్ధంగా ఉన్నప్పుడు దయచేసి మళ్ళీ మాట్లాడండి.',
  },
};

export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: { type: Type.STRING, enum: INTENTS },
    language: { type: Type.STRING, enum: ['en', 'hi', 'te'] },
  },
  required: ['intent', 'language'],
};

export const SAFE_FALLBACK_RESPONSE = Object.freeze({
  intent: 'unknown',
  replyText: REPLIES.unknown.en,
  actionTrigger: { type: 'NONE', targetId: null },
});

export default {
  handleVoice,
  processVoiceCommand,
  callWithFallback,
  streamWithHedgeAndTimeout,
  checkFastPath,
  loadSessionContext,
  getRelevantContextSubset,
  MODEL,
  MODELS,
  PRIMARY_MODEL,
  FALLBACK_MODEL,
  INTENTS,
  REPLIES,
  EMERGENCY_WORDS,
  SYSTEM,
  SYSTEM_PROMPT,
  RESPONSE_SCHEMA,
  SAFE_FALLBACK_RESPONSE,
  CircuitBreaker,
  primaryCircuitBreaker,
  LatencyLogger,
};
