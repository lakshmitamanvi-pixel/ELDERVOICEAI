import { GoogleGenAI, Type } from '@google/genai';
import { SentenceBoundarySplitter } from './speechService.js';
import { retrieve } from './memory_retriever.js';

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
  'gemini-3.6-flash';

export const FALLBACK_MODEL =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_FALLBACK_MODEL) ||
  (typeof process !== 'undefined' && process?.env?.VITE_GEMINI_FALLBACK_MODEL) ||
  'gemini-3.5-flash-lite';

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

export function extractErrorDetails(err) {
  const status = err?.status || err?.statusCode || err?.response?.status || 'UNKNOWN_STATUS';
  const message = err?.message || String(err);
  let errorBody = err?.response || null;
  if (!errorBody && typeof message === 'string' && message.startsWith('{')) {
    try {
      errorBody = JSON.parse(message);
    } catch (_) {}
  }
  return { status, message, errorBody: errorBody || message };
}

/**
 * ----------------------------------------------------------------------------
 * STARTUP HEALTH CHECK (Tiny test prompt per configured model)
 * Probes each configured model, logging status code and error body on failure.
 * ----------------------------------------------------------------------------
 */
export async function checkStartupHealth() {
  const client = getPersistentClient();
  const results = {};
  console.group('[Gemini HealthCheck] Checking configured models on startup...');

  if (!client) {
    const errorMsg = 'Client initialization failed: VITE_GEMINI_API_KEY is not defined or invalid.';
    console.error(`[Gemini HealthCheck] FAILED - ${errorMsg}`);
    console.groupEnd();
    return {
      success: false,
      error: errorMsg,
      models: {},
    };
  }

  const modelsToCheck = [
    { role: 'primary', name: PRIMARY_MODEL },
    { role: 'fallback', name: FALLBACK_MODEL },
  ];

  let allHealthy = true;

  for (const { role, name } of modelsToCheck) {
    const startTime = Date.now();
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => abortController.abort(), 15000);
    try {
      const response = await client.models.generateContent({
        model: name,
        contents: 'ping',
        config: {
          maxOutputTokens: 5,
          abortSignal: abortController.signal,
        },
      });
      clearTimeout(timeoutId);
      const durationMs = Date.now() - startTime;
      const status = 200;
      console.log(
        `%c[Gemini HealthCheck] [${role.toUpperCase()}] Model '${name}': HEALTHY (Status: ${status}, ${durationMs}ms)`,
        'color: #059669; font-weight: bold;',
        `\nResponse: "${response.text?.trim()}"`
      );
      results[name] = {
        role,
        healthy: true,
        status,
        durationMs,
        response: response.text?.trim() || '',
      };
    } catch (err) {
      clearTimeout(timeoutId);
      allHealthy = false;
      const durationMs = Date.now() - startTime;
      const { status, message, errorBody } = extractErrorDetails(err);

      console.error(

        ``
        `%c[Gemini HealthCheck] [${role.toUpperCase()}] Model '${name}': FAILED (Status: ${status}, ${durationMs}ms)`,
        'color: #dc2626; font-weight: bold;',
        '\nStatus:', status,
        '\nMessage:', message,
        '\nError Body:', errorBody,
        '\nRaw Error:', err
      );

      results[name] = {
        role,
        healthy: false,
        status,
        durationMs,
        message,
        errorBody,
      };
    }
  }

  console.groupEnd();
  return {
    success: allHealthy,
    models: results,
  };
}

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

    const { status, message } = extractErrorDetails(error);
    console.error(
      `[CircuitBreaker] Failure on ${modelName} - Status: ${status}, Message: ${message} (${this.failures.length}/${this.threshold} in last ${this.windowMs / 1000}s)`
    );

    const isQuotaExhausted = status === 429 || String(message).includes('RESOURCE_EXHAUSTED');

    if (isQuotaExhausted || this.failures.length >= this.threshold || this.state === 'HALF_OPEN') {
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
 * Answer about people/medicines/schedule ONLY from FACTS.
 */
export const SYSTEM_PROMPT =
  'You are ElderVoice AI. Reply in 1-2 short, warm sentences. Answer people, medicines, or schedule ONLY from FACTS. If not in FACTS, say: "I\'m not sure, shall I ask Sarah?" Never invent facts.';

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

  // 3. Medicine / Dose / Time questions: answer directly from DB, skip LLM for factual part
  const isMedGeneralQuery =
    /\b(what|which|list|tell me about)\s+(are\s+)?(my\s+)?(all\s+)?(med|meds|medicine|medicines|pill|pills|medication|medications|prescription|prescriptions)\b/i.test(
      lower
    );
  const isDoseQuery = /\b(dose|dosage|how much|how many)\b/i.test(lower);
  const isTimeOrScheduleQuery = /\b(when|what time|schedule|scheduled|how often)\b/i.test(lower);
  const matchedMed = (ctx.medications || []).find((m) =>
    new RegExp(`\\b${m.name.toLowerCase()}\\b`, 'i').test(lower)
  );

  if (matchedMed && (isDoseQuery || isTimeOrScheduleQuery || isMedGeneralQuery || lower.includes(matchedMed.name.toLowerCase()))) {
    const isDoseOnly = isDoseQuery && !isTimeOrScheduleQuery;
    const isTimeOnly = isTimeOrScheduleQuery && !isDoseQuery;
    let reply = '';
    if (isDoseOnly) {
      reply = `Your dose of ${matchedMed.name} is ${matchedMed.dosage}. ${matchedMed.instructions || ''}`.trim();
    } else if (isTimeOnly) {
      reply = `You take ${matchedMed.name} at ${matchedMed.scheduleTime}. ${matchedMed.instructions || ''}`.trim();
    } else {
      reply = `Your ${matchedMed.name} is ${matchedMed.dosage}, scheduled for ${matchedMed.scheduleTime}. ${matchedMed.instructions || ''}`.trim();
    }
    return {
      handled: true,
      intent: 'medication_factual',
      reply,
      actionTrigger: { type: 'NONE', targetId: matchedMed.id },
    };
  }

  if (isMedGeneralQuery && !lower.includes('take') && !lower.includes('taken')) {
    const summary = (ctx.medications || []).map((m) => `${m.name} ${m.dosage} at ${m.scheduleTime}`).join(', ');
    return {
      handled: true,
      intent: 'medication_factual',
      reply: `Your scheduled medications are: ${summary}.`,
      actionTrigger: { type: 'NONE', targetId: null },
    };
  }

  // 4. "did I take my medicine" rule
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
 * Identify conversational small talk / greetings to skip memory retrieval
 * and avoid adding any latency.
 */
export const isSmallTalk = (transcript = '') => {
  if (!transcript || typeof transcript !== 'string') return false;
  const clean = transcript.trim().toLowerCase().replace(/[!?.,]/g, '');
  const smallTalkPatterns = [
    /^(hi|hello|hey|good morning|good afternoon|good evening|good night)$/,
    /^(how are you|how are you doing|how is it going|how are things)$/,
    /^(thank you|thanks|thanks a lot|thank you very much)$/,
    /^(bye|goodbye|see you|talk to you later)$/,
    /^(yes|no|okay|ok|sure|alright)$/,
    /^(who are you|what is your name)$/,
    /^(nice to meet you|pleased to meet you)$/,
  ];
  return smallTalkPatterns.some((pattern) => pattern.test(clean));
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
    this.t_retrieval_ms = 0;
    this.factIdsUsed = [];
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

  markRetrieval(durationMs, factIds = []) {
    this.t_retrieval_ms = durationMs;
    this.factIdsUsed = factIds;
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
      if (this.factIdsUsed && this.factIdsUsed.length > 0) {
        console.log(`Memory Retrieval (${this.t_retrieval_ms || 0} ms): Fact IDs: [${this.factIdsUsed.join(', ')}]`);
      } else {
        console.log(`Memory Retrieval:          Skipped (0 ms added latency)`);
      }
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
      retrievalMs: this.t_retrieval_ms || 0,
      factIdsUsed: this.factIdsUsed || [],
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
      const { status, message, errorBody } = extractErrorDetails(fbErr);
      console.error(
        `[geminiService] FALLBACK MODEL FAILURE (Circuit Open Direct Route, ${FALLBACK_MODEL}) - Status: ${status}, Message: ${message}`,
        '\nError Body:',
        errorBody,
        fbErr
      );
      throw fbErr;
    }
  }

  // 2. Normal Flow: Primary with 3s hard timeout & 2s hedged request
  if (logger) logger.markLLMStart();
  const primaryController = new AbortController();
  let fallbackController = null;
  let primaryFirstTokenArrived = false;
  let fallbackFirstTokenArrived = false;
  let primaryEnded = false;
  let fallbackEnded = false;
  let primaryError = null;
  let fallbackError = null;

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
      console.info(`[HedgedRequest] 2s elapsed or primary failure. Firing fallback (${FALLBACK_MODEL}) in parallel.`);
      if (logger) logger.hedgedFired = true;

      fallbackController = new AbortController();
      fallbackTimeoutId = setTimeout(() => {
        if (!resolved && !fallbackFirstTokenArrived) {
          fallbackController.abort();
          fallbackEnded = true;
          if (primaryEnded && !resolved) {
            cleanup();
            reject(fallbackError || primaryError || new Error(`Fallback (${FALLBACK_MODEL}) timed out.`));
          }
        }
      }, FALLBACK_TIMEOUT_MS);

      runModelStream(FALLBACK_MODEL, fallbackController)
        .then((result) => {
          if (!resolved) {
            handleSuccess(result);
          }
        })
        .catch((err) => {
          fallbackEnded = true;
          fallbackError = err;
          const { status, message, errorBody } = extractErrorDetails(err);
          console.error(
            `[geminiService] FALLBACK MODEL FAILURE (${FALLBACK_MODEL}) - Status: ${status}, Message: ${message}`,
            '\nError Body:',
            errorBody,
            err
          );
          if (!resolved && primaryEnded) {
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
      if (!primaryFirstTokenArrived && !primaryEnded && !resolved) {
        console.warn(`[Timeout] Primary model (${PRIMARY_MODEL}) hit 3s hard timeout. Aborting.`);
        primaryController.abort();
        primaryEnded = true;
        primaryError = new Error(`3s Primary Timeout for ${PRIMARY_MODEL}`);
        primaryCircuitBreaker.recordFailure(PRIMARY_MODEL, primaryError);
        if (!fallbackController) {
          triggerFallback();
        } else if (fallbackEnded) {
          cleanup();
          reject(fallbackError || primaryError);
        }
      }
    }, PRIMARY_TIMEOUT_MS);

    // Run Primary Model Stream
    runModelStream(PRIMARY_MODEL, primaryController)
      .then((result) => {
        primaryFirstTokenArrived = true;
        primaryEnded = true;
        if (!resolved) {
          handleSuccess(result);
        }
      })
      .catch((err) => {
        primaryEnded = true;
        primaryError = err;
        const { status, message, errorBody } = extractErrorDetails(err);
        primaryCircuitBreaker.recordFailure(PRIMARY_MODEL, err);
        console.error(
          `[geminiService] PRIMARY MODEL FAILURE (${PRIMARY_MODEL}) - Status: ${status}, Message: ${message}`,
          '\nError Body:',
          errorBody,
          `\nAction: Routing request to fallback (${FALLBACK_MODEL}) without silent failure.`,
          err
        );
        if (!fallbackController && !resolved) {
          triggerFallback();
        } else if (fallbackEnded && !resolved) {
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
      retrievedFactIds: [],
      retrievalMs: 0,
      logger,
    };
  }

  // 2. LLM Path: Top 4 Facts Retrieval (Skip for SOS and small talk)
  const shouldSkipRetrieval = EMERGENCY_WORDS.test(cleanText) || isSmallTalk(cleanText);
  let retrievedChunks = [];
  let retrievalDurationMs = 0;
  let factIds = [];

  if (!shouldSkipRetrieval) {
    const tRetStart = Date.now();
    try {
      // Retrieval budget: must add < 300ms
      const retPromise = retrieve(cleanText, 4);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Retrieval timeout (>280ms)')), 280)
      );
      retrievedChunks = await Promise.race([retPromise, timeoutPromise]);
    } catch (retErr) {
      console.warn(`[geminiService] Fast retrieval fallback triggered: ${retErr.message}`);
      try {
        retrievedChunks = await retrieve(cleanText, 4, { forceFallback: true });
      } catch (_) {
        retrievedChunks = [];
      }
    }
    retrievalDurationMs = Date.now() - tRetStart;
    factIds = retrievedChunks.map((c) => c.id);
    logger.markRetrieval(retrievalDurationMs, factIds);
    console.log(`[geminiService] Retrieval took ${retrievalDurationMs}ms (Used fact IDs: ${factIds.join(', ') || 'None'})`);
  } else {
    logger.markRetrieval(0, []);
    console.log('[geminiService] Retrieval skipped for SOS / small talk (0ms added latency)');
  }

  // Inject ONLY top 4 facts into prompt in a "FACTS" block, each with its id
  const factsBlock = retrievedChunks.length > 0
    ? `FACTS:\n${retrievedChunks.map((c) => `- [${c.id}]: ${c.text}`).join('\n')}`
    : 'FACTS:\n(None available)';

  const promptWithContext = shouldSkipRetrieval
    ? cleanText
    : `${factsBlock}\n\nUser prompt: "${cleanText}"`;

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
      retrievedFactIds: factIds,
      retrievalMs: retrievalDurationMs,
      logger,
    };
  } catch (err) {
    const { status, message, errorBody } = extractErrorDetails(err);
    console.error(
      `[geminiService] All LLM stream models failed or timed out - Status: ${status}, Message: ${message}`,
      '\nError Body:',
      errorBody,
      err
    );

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
      fastPath: false,
      retrievedFactIds: factIds,
      retrievalMs: retrievalDurationMs,
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
      const { status, message, errorBody } = extractErrorDetails(err);
      console.error(
        `[geminiService] Model ${m} failed - Status: ${status}, Message: ${message}`,
        '\nError Body:',
        errorBody,
        err
      );
      const numStatus = Number(status);
      if (numStatus === 429 || numStatus === 500 || numStatus === 503 || numStatus === 404) {
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
  checkStartupHealth,
  extractErrorDetails,
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
