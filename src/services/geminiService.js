import { GoogleGenAI, Type } from '@google/genai';
import { SentenceBoundarySplitter } from './speechService.js';
import { retrieve } from './memory_retriever.js';

/**
 * ----------------------------------------------------------------------------
 * 5. MODEL CONFIGURATION CONSTANTS (Single ENV source, no hardcoded model IDs)
 * ----------------------------------------------------------------------------
 */
const loadNodeEnvSync = () => {
  if (typeof process === 'undefined' || !process.versions?.node) return;
  try {
    const fs = process.getBuiltinModule?.('fs');
    const path = process.getBuiltinModule?.('path');
    if (!fs || !path) return;
    const envPath = path.resolve(process.cwd(), '.env');
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch (_) {}
};
loadNodeEnvSync();

const readEnvVar = (keys) => {
  for (const key of keys) {
    try {
      if (typeof import.meta !== 'undefined' && import.meta?.env?.[key]) {
        return String(import.meta.env[key]).trim();
      }
    } catch (_) {}
    if (typeof process !== 'undefined' && process?.env?.[key]) {
      return String(process.env[key]).trim();
    }
  }
  return '';
};

export const PRIMARY_MODEL = readEnvVar(['PRIMARY_MODEL', 'VITE_GEMINI_PRIMARY_MODEL', 'VITE_GEMINI_MODEL']);
export const FALLBACK_MODEL = readEnvVar(['FALLBACK_MODEL', 'VITE_GEMINI_FALLBACK_MODEL']);
export const CANNED_FALLBACK_REPLY = "I'm not sure, shall I ask ur family?";

export const MODEL = PRIMARY_MODEL;
export const MODELS = [PRIMARY_MODEL, FALLBACK_MODEL].filter(Boolean);

let activePrimaryModel = PRIMARY_MODEL;
let activeFallbackModel = FALLBACK_MODEL;
let modelsUnavailable = false;
let startupValidationDone = false;
let validGenerateContentModels = [];

export const PRIMARY_TIMEOUT_MS = Number(readEnvVar(['VITE_PRIMARY_TIMEOUT_MS']) || 4500);
export const HEDGE_DELAY_MS = Number(readEnvVar(['VITE_HEDGE_DELAY_MS']) || 2000);
export const FALLBACK_TIMEOUT_MS = Number(readEnvVar(['VITE_FALLBACK_TIMEOUT_MS']) || 25000);
export const FILLER_TIMEOUT_MS = Number(readEnvVar(['VITE_FILLER_TIMEOUT_MS']) || 1500);
export const MAX_OUTPUT_TOKENS = Number(readEnvVar(['VITE_MAX_OUTPUT_TOKENS']) || 512);

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
 * STARTUP MODEL VALIDATION (ListModels)
 * Validates PRIMARY_MODEL and FALLBACK_MODEL against ListModels (generateContent).
 * - If primary invalid -> loud warning + auto-swap to fallback.
 * - If both invalid -> log error + use canned reply, never crash.
 * ----------------------------------------------------------------------------
 */
export async function checkStartupHealth() {
  const client = getPersistentClient();
  console.group('[Gemini StartupValidation] Validating configured models via ListModels...');

  if (PRIMARY_MODEL && FALLBACK_MODEL && PRIMARY_MODEL === FALLBACK_MODEL) {
    const msg = `Startup assertion failed: PRIMARY_MODEL ('${PRIMARY_MODEL}') must differ from FALLBACK_MODEL ('${FALLBACK_MODEL}').`;
    console.error(`❌ [Gemini StartupValidation] ${msg}`);
    console.groupEnd();
    throw new Error(msg);
  }

  activePrimaryModel = PRIMARY_MODEL;
  activeFallbackModel = FALLBACK_MODEL;
  modelsUnavailable = false;

  if (!client) {
    const errorMsg = 'Client initialization failed: VITE_GEMINI_API_KEY is not defined or invalid.';
    console.error(`[Gemini StartupValidation] ERROR - ${errorMsg} Using canned reply fallback.`);
    modelsUnavailable = true;
    activePrimaryModel = '';
    activeFallbackModel = '';
    startupValidationDone = true;
    console.log(
      `[Gemini StartupValidation] Resolved models -> PRIMARY: '${activePrimaryModel || 'NONE'}', FALLBACK: '${activeFallbackModel || 'NONE'}'`
    );
    console.groupEnd();
    return {
      success: false,
      error: errorMsg,
      activePrimaryModel,
      activeFallbackModel,
      modelsUnavailable,
      validModels: [],
    };
  }

  try {
    const pager = await client.models.list();
    const discovered = [];
    for await (const m of pager) {
      const methods = m.supportedActions || m.supportedGenerationMethods || [];
      if (methods.includes('generateContent')) {
        const cleanId = String(m.name || '').replace(/^models\//, '');
        if (cleanId) discovered.push({ id: cleanId, methods });
      }
    }
    validGenerateContentModels = discovered;
    const validSet = new Set(discovered.map((d) => d.id));

    const primaryValid = Boolean(PRIMARY_MODEL && validSet.has(PRIMARY_MODEL));
    const fallbackValid = Boolean(FALLBACK_MODEL && validSet.has(FALLBACK_MODEL));

    if (!primaryValid && fallbackValid) {
      console.warn(
        `⚠️ [Gemini StartupValidation] LOUD WARNING: PRIMARY_MODEL ('${PRIMARY_MODEL || 'UNSET'}') is NOT valid for generateContent! Auto-swapping primary to FALLBACK_MODEL ('${FALLBACK_MODEL}').`
      );
      activePrimaryModel = FALLBACK_MODEL;
      activeFallbackModel = '';
    } else if (!primaryValid && !fallbackValid) {
      console.error(
        `❌ [Gemini StartupValidation] ERROR: Both PRIMARY_MODEL ('${PRIMARY_MODEL || 'UNSET'}') and FALLBACK_MODEL ('${FALLBACK_MODEL || 'UNSET'}') are invalid for generateContent! Canned reply will be used.`
      );
      modelsUnavailable = true;
      activePrimaryModel = '';
      activeFallbackModel = '';
    } else if (primaryValid && !fallbackValid) {
      console.warn(
        `⚠️ [Gemini StartupValidation] WARNING: FALLBACK_MODEL ('${FALLBACK_MODEL || 'UNSET'}') is invalid for generateContent. Proceeding with PRIMARY_MODEL ('${PRIMARY_MODEL}') only.`
      );
      activeFallbackModel = '';
    } else {
      console.log(
        `✅ [Gemini StartupValidation] Both models verified via ListModels: PRIMARY='${activePrimaryModel}', FALLBACK='${activeFallbackModel}'`
      );
    }

    startupValidationDone = true;
    console.log(
      `[Gemini StartupValidation] Resolved models -> PRIMARY: '${activePrimaryModel || 'NONE'}', FALLBACK: '${activeFallbackModel || 'NONE'}'`
    );
    console.groupEnd();
    return {
      success: !modelsUnavailable,
      activePrimaryModel,
      activeFallbackModel,
      modelsUnavailable,
      swapped: !primaryValid && fallbackValid,
      validModels: discovered,
    };
  } catch (err) {
    const { status, message } = extractErrorDetails(err);
    console.error(
      `[Gemini StartupValidation] ListModels request failed (Status: ${status}, Message: ${message}). Keeping configured env models if present.`
    );
    if (!PRIMARY_MODEL && !FALLBACK_MODEL) {
      modelsUnavailable = true;
    } else if (!PRIMARY_MODEL && FALLBACK_MODEL) {
      activePrimaryModel = FALLBACK_MODEL;
      activeFallbackModel = '';
    }
    startupValidationDone = true;
    console.log(
      `[Gemini StartupValidation] Resolved models -> PRIMARY: '${activePrimaryModel || 'NONE'}', FALLBACK: '${activeFallbackModel || 'NONE'}'`
    );
    console.groupEnd();
    return {
      success: !modelsUnavailable,
      error: message,
      activePrimaryModel,
      activeFallbackModel,
      modelsUnavailable,
      validModels: [],
    };
  }
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
    this.fallbackTriggered = false;
    this.errorType = null;
    this.statusCode = null;
    this.finishReason = null;
    this.ttftMs = null;
    this.totalLatencyMs = null;
    this.summaryPrinted = false;
  }

  markCallOutcome({ modelUsed, fallbackTriggered, errorType, statusCode, ttftMs, totalLatencyMs, finishReason }) {
    if (modelUsed) this.modelAnswered = modelUsed;
    this.fallbackTriggered = Boolean(fallbackTriggered);
    this.hedgedFired = Boolean(fallbackTriggered);
    this.errorType = errorType || null;
    this.statusCode = statusCode || null;
    this.ttftMs = ttftMs ?? this.ttftMs;
    this.totalLatencyMs = totalLatencyMs ?? this.totalLatencyMs;
    this.finishReason = finishReason || null;
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
 * CENTRALIZED LLM CALLER: call_llm(prompt, options)
 * - Tries PRIMARY -> validates result -> on ANY failure retries once on FALLBACK -> else canned reply
 * - Wraps stream iteration so mid-stream failures never leave half-sentences
 * - Supports FORCE_PRIMARY_FAIL=timeout|404|empty|safety|midstream for testing
 * ----------------------------------------------------------------------------
 */
const BLOCKED_FINISH_REASONS = new Set([
  'SAFETY',
  'RECITATION',
  'BLOCKLIST',
  'PROHIBITED_CONTENT',
  'SPII',
]);

export function buildThinkingConfig(modelName = '') {
  const lower = String(modelName).toLowerCase();
  if (lower.includes('3.5')) {
    return { thinkingLevel: 'MINIMAL' };
  }
  if (lower.includes('3.6') || lower.includes('3.7') || lower.includes('2.5')) {
    return { thinkingBudget: 0 };
  }
  return undefined;
}

function hasUsableText(text) {
  return typeof text === 'string' && text.trim().length > 0 && /[a-zA-Z0-9\u0900-\u097F\u0C00-\u0C7F]/.test(text);
}

function classifyError(err, timedOut = false) {
  if (timedOut) {
    return { errorType: 'TIMEOUT', statusCode: 408, failureReason: 'timeout (408)' };
  }
  if (err?.errorType) {
    const code = err.status || 'UNKNOWN';
    return { errorType: err.errorType, statusCode: code, failureReason: `${err.errorType} (${code}): ${err.message}` };
  }
  const { status, message } = extractErrorDetails(err);
  const numStatus = Number(status);
  if (numStatus === 404) return { errorType: 'NOT_FOUND', statusCode: 404, failureReason: `HTTP 404: ${message}` };
  if (numStatus === 429 || String(message).includes('RESOURCE_EXHAUSTED')) {
    return { errorType: 'RATE_LIMIT', statusCode: 429, failureReason: `HTTP 429: ${message}` };
  }
  if (numStatus >= 500 && numStatus < 600) {
    return { errorType: 'SERVER_ERROR', statusCode: numStatus, failureReason: `HTTP ${numStatus}: ${message}` };
  }
  if (err?.name === 'AbortError' || String(message).toLowerCase().includes('abort')) {
    return { errorType: 'TIMEOUT', statusCode: 408, failureReason: 'timeout (abort)' };
  }
  return { errorType: 'API_ERROR', statusCode: status || 'UNKNOWN', failureReason: `${status || 'EXCEPTION'}: ${message}` };
}

function logGeminiCall({ modelUsed, fallbackTriggered, errorType, statusCode, failureReason, ttftMs, totalLatencyMs, finishReason }) {
  console.log(
    `[GeminiCall] model_used=${modelUsed} | fallback_used=${Boolean(fallbackTriggered)} | failure_reason=${failureReason || 'none'} | ttft=${ttftMs ?? 'N/A'}ms | total_latency=${totalLatencyMs}ms | finish_reason=${finishReason || 'UNKNOWN'}`
  );
}

function getInjectedFailure(role) {
  const key = role === 'primary' ? 'FORCE_PRIMARY_FAIL' : 'FORCE_FALLBACK_FAIL';
  try {
    if (typeof import.meta !== 'undefined' && import.meta?.env?.[key]) {
      return String(import.meta.env[key]).trim().toLowerCase();
    }
  } catch (_) {}
  if (typeof process !== 'undefined' && process?.env?.[key]) {
    return String(process.env[key]).trim().toLowerCase();
  }
  return '';
}

export async function call_llm(prompt, options = {}) {
  const {
    systemInstruction = SYSTEM_PROMPT,
    onToken,
    onSentence,
    onFirstToken,
    logger,
    primaryTimeoutMs = PRIMARY_TIMEOUT_MS,
    fallbackTimeoutMs = FALLBACK_TIMEOUT_MS,
  } = options;

  const callStart = Date.now();
  const client = getPersistentClient();

  if (PRIMARY_MODEL && FALLBACK_MODEL && PRIMARY_MODEL === FALLBACK_MODEL) {
    throw new Error(`PRIMARY_MODEL ('${PRIMARY_MODEL}') must differ from FALLBACK_MODEL ('${FALLBACK_MODEL}').`);
  }

  const emitCanned = (fallbackTriggered, errorType, statusCode, failureReason, finishReason = 'CANNED_FALLBACK') => {
    const totalLatencyMs = Date.now() - callStart;
    if (typeof onToken === 'function') onToken(CANNED_FALLBACK_REPLY, CANNED_FALLBACK_REPLY);
    if (typeof onSentence === 'function') onSentence(CANNED_FALLBACK_REPLY);
    const outcome = {
      modelUsed: 'canned',
      fallbackTriggered,
      errorType,
      statusCode,
      failureReason,
      ttftMs: 0,
      totalLatencyMs,
      finishReason,
    };
    logGeminiCall(outcome);
    if (logger) logger.markCallOutcome(outcome);
    return {
      text: CANNED_FALLBACK_REPLY,
      model: 'canned',
      fallbackTriggered,
      errorType,
      statusCode,
      failureReason,
      ttftMs: 0,
      totalLatencyMs,
      finishReason,
    };
  };

  if (modelsUnavailable || !client || (!activePrimaryModel && !activeFallbackModel)) {
    const reason = client ? 'NO_VALID_MODELS' : 'MISSING_API_KEY';
    return emitCanned(false, reason, 'N/A', reason, 'CANNED_FALLBACK');
  }

  const runModelStream = async (modelName, ttftTimeoutMs, role) => {
    const abortController = new AbortController();
    let firstTokenArrived = false;
    let timedOut = false;
    let ttftMs = null;
    let spokenSentencesCount = 0;
    const attemptStart = Date.now();

    const ttftTimer = setTimeout(() => {
      if (!firstTokenArrived) {
        timedOut = true;
        abortController.abort();
      }
    }, ttftTimeoutMs);

    const splitter = new SentenceBoundarySplitter((s) => {
      spokenSentencesCount++;
      if (typeof onSentence === 'function') onSentence(s);
    });

    const injectedMode = getInjectedFailure(role);

    const thinkingConfig = buildThinkingConfig(modelName);
    const config = {
      systemInstruction,
      temperature: 0.2,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: abortController.signal,
      ...(thinkingConfig ? { thinkingConfig } : {}),
    };

    try {
      let stream;
      if (injectedMode === '404') {
        const err = new Error(`Injected 404 Not Found for ${modelName}`);
        err.status = 404;
        throw err;
      } else if (injectedMode === 'timeout') {
        stream = (async function* () {
          await new Promise((_, reject) => {
            abortController.signal.addEventListener('abort', () => {
              const e = new Error(`Injected TTFT timeout (${ttftTimeoutMs}ms) on ${modelName}`);
              e.name = 'AbortError';
              reject(e);
            });
          });
        })();
      } else if (injectedMode === 'empty') {
        stream = (async function* () {
          yield { text: '   \n  ', candidates: [{ finishReason: 'STOP' }] };
        })();
      } else if (injectedMode === 'safety') {
        stream = (async function* () {
          yield { text: '', candidates: [{ finishReason: 'SAFETY' }], promptFeedback: { blockReason: 'SAFETY' } };
        })();
      } else if (injectedMode === 'midstream') {
        stream = (async function* () {
          yield { text: 'Let me check on that for you, ' };
          throw new Error(`Injected mid-stream failure on ${modelName}`);
        })();
      } else {
        stream = await client.models.generateContentStream({
          model: modelName,
          contents: prompt,
          config,
        });
      }

      let fullText = '';
      let finishReason = null;

      for await (const chunk of stream) {
        if (abortController.signal.aborted) break;

        const candidateReason = chunk?.candidates?.[0]?.finishReason;
        const blockReason = chunk?.promptFeedback?.blockReason;
        if (blockReason) finishReason = blockReason;
        else if (candidateReason) finishReason = candidateReason;

        const text = chunk.text || '';
        if (!text) continue;

        if (!firstTokenArrived) {
          firstTokenArrived = true;
          clearTimeout(ttftTimer);
          ttftMs = Date.now() - attemptStart;
          if (typeof onFirstToken === 'function') onFirstToken(modelName);
        }

        fullText += text;
        splitter.push(text);
        if (typeof onToken === 'function') onToken(text, fullText);
      }

      clearTimeout(ttftTimer);

      if (timedOut && !firstTokenArrived) {
        const err = new Error(`TTFT timeout (${ttftTimeoutMs}ms) on ${modelName}`);
        err.errorType = 'TIMEOUT';
        err.status = 408;
        throw err;
      }

      if (finishReason && BLOCKED_FINISH_REASONS.has(finishReason)) {
        const err = new Error(`Response blocked (${finishReason}) on ${modelName}`);
        err.errorType = 'BLOCKED';
        err.status = finishReason;
        err.finishReason = finishReason;
        throw err;
      }

      if (!hasUsableText(fullText)) {
        const err = new Error(`Empty or unusable text returned by ${modelName} (finishReason=${finishReason || 'UNKNOWN'})`);
        err.errorType = 'EMPTY_TEXT';
        err.status = finishReason || 'EMPTY';
        err.finishReason = finishReason || 'EMPTY';
        throw err;
      }

      if (finishReason && finishReason !== 'STOP' && !hasUsableText(fullText)) {
        const err = new Error(`Non-STOP finish_reason (${finishReason}) with no usable text on ${modelName}`);
        err.errorType = 'INVALID_FINISH_REASON';
        err.status = finishReason;
        err.finishReason = finishReason;
        throw err;
      }

      // Only flush remaining buffered sentence after full validation succeeds
      splitter.flush();

      return {
        text: fullText,
        model: modelName,
        ttftMs: ttftMs ?? (Date.now() - attemptStart),
        finishReason: finishReason || 'STOP',
        spokenSentencesCount,
      };
    } catch (err) {
      clearTimeout(ttftTimer);
      const classified = classifyError(err, timedOut);
      err.errorType = classified.errorType;
      err.statusCode = classified.statusCode;
      err.failureReason = classified.failureReason;
      err.spokenSentencesCount = spokenSentencesCount;
      throw err;
    }
  };

  // 1. Try Primary Model
  const primaryToTry = activePrimaryModel || activeFallbackModel;
  const fallbackToTry = activeFallbackModel && activeFallbackModel !== primaryToTry ? activeFallbackModel : '';
  if (logger) logger.markLLMStart();

  try {
    const res = await runModelStream(primaryToTry, primaryTimeoutMs, 'primary');
    const totalLatencyMs = Date.now() - callStart;
    if (logger) {
      logger.markLLMFirstToken(res.model);
      logger.markLLMDone();
    }
    const outcome = {
      modelUsed: res.model,
      fallbackTriggered: false,
      errorType: null,
      statusCode: 200,
      failureReason: null,
      ttftMs: res.ttftMs,
      totalLatencyMs,
      finishReason: res.finishReason,
    };
    logGeminiCall(outcome);
    if (logger) logger.markCallOutcome(outcome);
    return {
      text: res.text,
      model: res.model,
      fallbackTriggered: false,
      errorType: null,
      statusCode: 200,
      failureReason: null,
      ttftMs: res.ttftMs,
      totalLatencyMs,
      finishReason: res.finishReason,
    };
  } catch (primaryErr) {
    const primaryErrorInfo = {
      errorType: primaryErr.errorType || 'API_ERROR',
      statusCode: primaryErr.statusCode || 'UNKNOWN',
      failureReason: primaryErr.failureReason || primaryErr.message,
    };

    if (!fallbackToTry) {
      return emitCanned(
        false,
        primaryErrorInfo.errorType,
        primaryErrorInfo.statusCode,
        primaryErrorInfo.failureReason,
        primaryErr.finishReason || primaryErrorInfo.errorType
      );
    }

    // 2. Retry once on Fallback Model
    console.warn(`FALLBACK USED: reason=${primaryErrorInfo.failureReason}`);
    try {
      const fbRes = await runModelStream(fallbackToTry, fallbackTimeoutMs, 'fallback');
      const totalLatencyMs = Date.now() - callStart;
      if (logger) {
        logger.markLLMFirstToken(fbRes.model);
        logger.markLLMDone();
      }
      const outcome = {
        modelUsed: fbRes.model,
        fallbackTriggered: true,
        errorType: primaryErrorInfo.errorType,
        statusCode: primaryErrorInfo.statusCode,
        failureReason: primaryErrorInfo.failureReason,
        ttftMs: fbRes.ttftMs,
        totalLatencyMs,
        finishReason: fbRes.finishReason,
      };
      logGeminiCall(outcome);
      if (logger) logger.markCallOutcome(outcome);
      return {
        text: fbRes.text,
        model: fbRes.model,
        fallbackTriggered: true,
        errorType: primaryErrorInfo.errorType,
        statusCode: primaryErrorInfo.statusCode,
        failureReason: primaryErrorInfo.failureReason,
        ttftMs: fbRes.ttftMs,
        totalLatencyMs,
        finishReason: fbRes.finishReason,
      };
    } catch (fbErr) {
      const fbErrorInfo = {
        errorType: fbErr.errorType || 'API_ERROR',
        statusCode: fbErr.statusCode || 'UNKNOWN',
        failureReason: `${primaryErrorInfo.failureReason} -> fallback failed: ${fbErr.failureReason || fbErr.message}`,
      };
      console.error(`[geminiService] Fallback (${fallbackToTry}) also failed: ${fbErrorInfo.failureReason}`);
      return emitCanned(
        true,
        fbErrorInfo.errorType,
        fbErrorInfo.statusCode,
        fbErrorInfo.failureReason,
        fbErr.finishReason || fbErrorInfo.errorType
      );
    }
  }
}

export async function streamWithHedgeAndTimeout(opts) {
  return call_llm(opts.prompt, opts);
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

  // Guaranteed SOS path: if emergency words detected, still allow SOS alert if call_llm fails or returns canned
  const result = await call_llm(promptWithContext, {
    systemInstruction: SYSTEM_PROMPT,
    onToken,
    onSentence,
    onFirstToken: (model) => {
      logger.markLLMFirstToken(model);
      if (typeof onFirstToken === 'function') onFirstToken(model);
    },
    logger,
  });

  if (result.model === 'canned' && EMERGENCY_WORDS.test(cleanText)) {
    const emergencyReply =
      'Emergency alert activated. Calling your daughter Sarah and alerting your caregiver right now. Please sit down and stay calm.';
    if (typeof onSentence === 'function') onSentence(emergencyReply);
    return {
      intent: 'emergency',
      reply: emergencyReply,
      actionTrigger: { type: 'TRIGGER_ALERT', targetId: 'sos' },
      logger,
    };
  }

  return {
    intent: result.model === 'canned' ? 'unknown' : 'assistant_response',
    reply: result.text,
    model: result.model,
    fallbackTriggered: Boolean(result.fallbackTriggered),
    errorType: result.errorType || null,
    statusCode: result.statusCode || 200,
    failureReason: result.failureReason || null,
    ttftMs: result.ttftMs ?? null,
    totalLatencyMs: result.totalLatencyMs ?? null,
    finishReason: result.finishReason || 'STOP',
    actionTrigger: { type: 'NONE', targetId: null },
    fastPath: false,
    retrievedFactIds: factIds,
    retrievalMs: retrievalDurationMs,
    logger,
  };
}

/**
 * Backward compatibility adapter for legacy callWithFallback callers (routes through call_llm).
 */
export async function callWithFallback(params) {
  const prompt = params?.contents ?? params?.prompt ?? '';
  const systemInstruction = params?.config?.systemInstruction || SYSTEM_PROMPT;
  const res = await call_llm(prompt, { systemInstruction });
  return { text: res.text, model: res.model, fallbackTriggered: res.fallbackTriggered };
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
  call_llm,
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
  CANNED_FALLBACK_REPLY,
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
