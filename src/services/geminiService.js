import { GoogleGenAI, Type } from '@google/genai';

/**
 * Fallback response object returned whenever an error, timeout, or parsing failure occurs.
 */
export const SAFE_FALLBACK_RESPONSE = Object.freeze({
  intent: 'general_chat',
  replyText: "I'm having a little trouble connecting right now, but I am here for you.",
  actionTrigger: {
    type: 'NONE',
    targetId: null,
  },
});

/**
 * Valid allowed values for intent and action trigger types.
 */
const VALID_INTENTS = new Set([
  'medication_confirmation',
  'medication_query',
  'appointment_query',
  'memory_query',
  'general_chat',
]);

const VALID_ACTION_TYPES = new Set([
  'CONFIRM_MEDICATION',
  'TRIGGER_ALERT',
  'NONE',
]);

/**
 * Milliseconds to wait before timing out a Gemini API request.
 */
const REQUEST_TIMEOUT_MS = 20000;

/**
 * Safely retrieve the Gemini API key across browser Vite and Node environments.
 */
const getApiKey = () => {
  try {
    if (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_API_KEY) {
      return import.meta.env.VITE_GEMINI_API_KEY;
    }
  } catch (_) {
    // Suppress environment access error in restricted contexts
  }

  if (typeof process !== 'undefined' && process?.env) {
    return process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || '';
  }

  return '';
};

const apiKey = getApiKey();

// Descriptive console error if the API key is missing
if (!apiKey) {
  console.error(
    '[geminiService] Missing VITE_GEMINI_API_KEY: Google Gemini API key is not configured in environment variables. ' +
    'Please set VITE_GEMINI_API_KEY in your .env file to enable AI voice entity extraction and intelligence.'
  );
}

// Safely initialize the client instance
let aiClient = null;
try {
  if (apiKey) {
    aiClient = new GoogleGenAI({ apiKey });
  }
} catch (initError) {
  console.error('[geminiService] Error initializing GoogleGenAI client:', initError);
  aiClient = null;
}

/**
 * Helper to get or lazily reinitialize the GenAI client if needed.
 */
const getClient = () => {
  if (aiClient) return aiClient;
  const currentKey = getApiKey();
  if (!currentKey) {
    console.error('[geminiService] Cannot initialize client: VITE_GEMINI_API_KEY is not defined.');
    return null;
  }
  try {
    aiClient = new GoogleGenAI({ apiKey: currentKey });
    return aiClient;
  } catch (err) {
    console.error('[geminiService] Failed to initialize GoogleGenAI client:', err);
    return null;
  }
};

/**
 * JSON Schema enforcing strict structured response from Gemini 3.8 Flash.
 */
export const VOICE_COMMAND_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: [
        'medication_confirmation',
        'medication_query',
        'appointment_query',
        'memory_query',
        'general_chat',
      ],
      description: 'The classified user intent.',
    },
    replyText: {
      type: Type.STRING,
      description: 'A clear, warm, simple response string matching the active language (1-3 sentences suitable for elderly text-to-speech).',
    },
    actionTrigger: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ['CONFIRM_MEDICATION', 'TRIGGER_ALERT', 'NONE'],
          description: 'Action trigger type based on explicit intent.',
        },
        targetId: {
          type: Type.STRING,
          nullable: true,
          description: 'Medication ID if CONFIRM_MEDICATION, alert identifier if TRIGGER_ALERT, or null if NONE.',
        },
      },
      required: ['type'],
    },
  },
  required: ['intent', 'replyText', 'actionTrigger'],
};

/**
 * Engineers a strict system instruction module that injects verified Firestore records
 * as immutable context and sets rigorous anti-hallucination guardrails.
 */
export function buildSystemInstruction(
  userProfile = {},
  medications = [],
  appointments = [],
  currentLang = 'en-US'
) {
  const seniorName = userProfile?.preferredName || userProfile?.fullName || 'Senior User';
  const fullName = userProfile?.fullName || seniorName;
  const age = userProfile?.age ? `${userProfile.age} years old` : 'Not recorded';
  const bloodType = userProfile?.bloodType || 'Not recorded';
  const allergies = userProfile?.allergies || 'None recorded';

  const medicalNotes = userProfile?.medicalNotes || {};
  const conditions = medicalNotes.conditions || userProfile?.conditions || 'None recorded';
  const dietary = medicalNotes.dietaryRestrictions || userProfile?.dietaryRestrictions || 'None recorded';
  const physician = medicalNotes.primaryPhysician
    ? `${medicalNotes.primaryPhysician}${medicalNotes.physicianPhone ? ` (Phone: ${medicalNotes.physicianPhone})` : ''}`
    : 'Not recorded';

  const emergencyContacts = Array.isArray(userProfile?.emergencyContacts) && userProfile.emergencyContacts.length > 0
    ? userProfile.emergencyContacts
        .map((c) => `- ${c.name} (${c.relationship || 'Emergency Contact'}): ${c.phone || 'N/A'}${c.isPrimary ? ' [PRIMARY]' : ''}`)
        .join('\n')
    : 'None recorded';

  const memoryVault = userProfile?.memoryVault || {};
  const familyMembers = Array.isArray(memoryVault.familyMembers) && memoryVault.familyMembers.length > 0
    ? memoryVault.familyMembers.map((f) => `- ${f.name} (${f.relationship}): ${f.note || ''}`).join('\n')
    : 'None recorded';

  const personalFacts = Array.isArray(memoryVault.personalFacts) && memoryVault.personalFacts.length > 0
    ? memoryVault.personalFacts.map((p) => `- [${p.category || 'Fact'}]: ${p.text || ''}`).join('\n')
    : 'None recorded';

  const caretakerNotes = Array.isArray(memoryVault.caretakerNotes) && memoryVault.caretakerNotes.length > 0
    ? memoryVault.caretakerNotes.map((n) => `- [${n.title || 'Note'}]: ${n.text || ''}`).join('\n')
    : 'None recorded';

  const medsList = Array.isArray(medications) && medications.length > 0
    ? medications
        .map(
          (m) =>
            `- ID: "${m.id}", Medicine: "${m.name}", Dosage: "${m.dosage || 'N/A'}", Scheduled Time: "${m.scheduleTime || 'N/A'}", Status: "${m.status || 'pending'}", Instructions: "${m.instructions || 'Take as prescribed'}"`
        )
        .join('\n')
    : 'No active medications registered.';

  const aptsList = Array.isArray(appointments) && appointments.length > 0
    ? appointments
        .map(
          (a) =>
            `- ID: "${a.id}", Doctor: "${a.doctorName || 'Doctor'}", Specialty: "${a.specialty || 'General'}", Scheduled Time: "${a.timestamp || 'N/A'}", Location: "${a.location || 'N/A'}", Notes: "${a.notes || 'None'}", Status: "${a.status || 'upcoming'}"`
        )
        .join('\n')
    : 'No upcoming appointments scheduled.';

  const languageDirectives = {
    'en-US': 'Respond strictly in English. Use clear, warm, gentle, simple, and supportive words.',
    'hi-IN': 'Respond strictly in Hindi (हिन्दी) using Devanagari script. Use respectful, warm, and natural conversational Hindi (e.g. use "आप" rather than "तुम").',
    'te-IN': 'Respond strictly in Telugu (తెలుగు) using Telugu script. Use polite, affectionate, and natural conversational Telugu (గౌరవప్రదమైన మాటలు).',
    'es-ES': 'Respond strictly in Spanish (Español). Use warm, simple, and gentle vocabulary.',
  };
  const activeLangRule = languageDirectives[currentLang] || `Respond strictly in the language matching code "${currentLang}".`;

  return `You are ElderVoice AI, a compassionate, hyper-reliable, patient, and loving voice companion designed specifically for elderly individuals.

### IMMUTABLE VERIFIED GROUNDING CONTEXT (FIRESTORE RECORDS):
--- SENIOR PROFILE ---
- Preferred / Full Name: ${seniorName} (${fullName})
- Age: ${age}
- Blood Type: ${bloodType}
- Documented Allergies: ${allergies}
- Medical Conditions: ${conditions}
- Dietary Restrictions: ${dietary}
- Primary Physician: ${physician}

--- EMERGENCY CONTACTS ---
${emergencyContacts}

--- MEMORY VAULT ---
Family Members:
${familyMembers}

Personal Facts & Preferences:
${personalFacts}

Caretaker Care Guidance:
${caretakerNotes}

--- ACTIVE MEDICATIONS SCHEDULE ---
${medsList}

--- UPCOMING APPOINTMENTS ---
${aptsList}
----------------------------------------

### RIGOROUS OPERATIONAL GUARDRAILS:
1. ABSOLUTE GROUNDING & ZERO HALLUCINATION:
   - You must ONLY use the verified information above.
   - NEVER invent or hallucinate family members, dates, medical conditions, medications, or memories not present in the verified context.
   - If asked about information not in these records, gently inform the senior that you do not have that specific detail recorded and suggest checking with their caretaker or doctor.

2. MEDICATION CONSUMPTION CONFIRMATION RULE:
   - NEVER assume or infer that a medication was taken unless the senior EXPLICITLY and unequivocally states in their voice command that they have taken, swallowed, or consumed it (e.g., "I took my Lisinopril", "I just swallowed my morning pill", "Maine dawaai le li", "నేను మందులు వేసుకున్నాను").
   - Questions like "Did I take my medicine?", "What pill do I need now?", or "Is it time for my medication?" are queries, NOT confirmations.
   - When an explicit confirmation is detected:
     * Set "intent" to "medication_confirmation".
     * Set "actionTrigger.type" to "CONFIRM_MEDICATION".
     * Set "actionTrigger.targetId" to the EXACT ID of the matching medication from the active medications list (e.g., "med-1"). If ambiguous or if multiple medications exist without specification, target the current pending medication scheduled for this time, or set to null if impossible to identify.
     * In "replyText", warmly acknowledge and congratulate them for taking the medication.

3. EMERGENCY & DISTRESS TRIGGER RULE:
   - If the senior indicates pain, falling, breathlessness, confusion, feeling unsafe, emergency, or asks to alert family/caretaker/doctor immediately:
     * Set "actionTrigger.type" to "TRIGGER_ALERT".
     * Set "actionTrigger.targetId" to "emergency_sos".
     * Provide an immediate, soothing, calming response reassuring them that help is being alerted right away.

4. INTENT CLASSIFICATION RULES:
   - "medication_confirmation": Senior explicitly confirms taking medication.
   - "medication_query": Senior asks about medicines, dosages, schedules, instructions, or whether they took their medicine.
   - "appointment_query": Senior asks about doctor visits, clinics, calendar, or upcoming appointments.
   - "memory_query": Senior asks about their family, career, favorite songs, memories, or notes from the memory vault.
   - "general_chat": Greetings, chit-chat, weather, feelings, companionship, or anything else.

5. LANGUAGE & VOICE OUTPUT REQUIREMENTS:
   - Active Language Code: "${currentLang}".
   - ${activeLangRule}
   - Speech-friendly: "replyText" will be read aloud by Text-to-Speech (TTS). Keep it between 1 to 3 short, gentle sentences.
   - NEVER include markdown characters (such as *, #, _, -, bullets), emojis, or technical codes in "replyText" because screen readers and speech synthesizers pronounce them literally.

6. JSON SCHEMA ENFORCEMENT:
   - You must output pure JSON adhering strictly to the schema provided.`;
}

/**
 * Cleans potential markdown formatting, code block markers, or trailing characters from JSON text.
 */
const sanitizeJsonString = (raw) => {
  if (typeof raw !== 'string') return '';
  let cleaned = raw.trim();

  // Strip code block fences if present: ```json ... ``` or ``` ... ```
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '');
    cleaned = cleaned.replace(/\s*```$/, '');
    cleaned = cleaned.trim();
  }

  // Extract content between first { and last }
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
};

/**
 * Normalizes and validates the parsed JSON object against the expected schema.
 */
const normalizeParsedResponse = (parsed) => {
  if (!parsed || typeof parsed !== 'object') {
    return { ...SAFE_FALLBACK_RESPONSE };
  }

  const intent = VALID_INTENTS.has(parsed.intent)
    ? parsed.intent
    : 'general_chat';

  const replyText = typeof parsed.replyText === 'string' && parsed.replyText.trim().length > 0
    ? parsed.replyText.trim()
    : SAFE_FALLBACK_RESPONSE.replyText;

  const rawAction = parsed.actionTrigger && typeof parsed.actionTrigger === 'object'
    ? parsed.actionTrigger
    : {};

  const actionType = VALID_ACTION_TYPES.has(rawAction.type)
    ? rawAction.type
    : 'NONE';

  let targetId = null;
  if (
    typeof rawAction.targetId === 'string' &&
    rawAction.targetId.trim().length > 0 &&
    rawAction.targetId.toLowerCase() !== 'null'
  ) {
    targetId = rawAction.targetId.trim();
  }

  return {
    intent,
    replyText,
    actionTrigger: {
      type: actionType,
      targetId,
    },
  };
};

/**
 * Processes a voice transcript against Firestore context using Gemini 3.8 Flash,
 * extracting entities, classifying intent, and producing a validated JSON action payload.
 *
 * @param {string} transcript Spoken text transcript from the elderly user.
 * @param {object} [userProfile={}] Verified Firestore senior profile and memory vault.
 * @param {Array} [medications=[]] Active Firestore medication records.
 * @param {Array} [appointments=[]] Upcoming Firestore appointment records.
 * @param {string} [currentLang='en-US'] Current spoken language code (e.g. 'en-US', 'hi-IN', 'te-IN').
 * @returns {Promise<{
 *   intent: 'medication_confirmation' | 'medication_query' | 'appointment_query' | 'memory_query' | 'general_chat',
 *   replyText: string,
 *   actionTrigger: {
 *     type: 'CONFIRM_MEDICATION' | 'TRIGGER_ALERT' | 'NONE',
 *     targetId: string | null
 *   }
 * }>}
 */
export async function processVoiceCommand(
  transcript,
  userProfile = {},
  medications = [],
  appointments = [],
  currentLang = 'en-US'
) {
  // If transcript is empty or whitespace, return fallback immediately without wasting an API call
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return { ...SAFE_FALLBACK_RESPONSE };
  }

  const client = getClient();
  if (!client) {
    console.error('[geminiService] Cannot process voice command: GoogleGenAI client is uninitialized due to missing VITE_GEMINI_API_KEY.');
    return { ...SAFE_FALLBACK_RESPONSE };
  }

  try {
    const systemInstruction = buildSystemInstruction(
      userProfile,
      medications,
      appointments,
      currentLang
    );

    // Prepare timeout race to ensure zero hanging or frozen states
    let timeoutHandle;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutHandle = setTimeout(() => {
        reject(new Error(`Gemini API request timed out after ${REQUEST_TIMEOUT_MS}ms`));
      }, REQUEST_TIMEOUT_MS);
      if (timeoutHandle && typeof timeoutHandle.unref === 'function') {
        timeoutHandle.unref();
      }
    });

    const generatePromise = client.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: transcript.trim(),
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: VOICE_COMMAND_RESPONSE_SCHEMA,
        temperature: 0.2,
      },
    });

    const response = await Promise.race([generatePromise, timeoutPromise]);
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }

    // Safely extract generated raw text
    let rawText = '';
    if (typeof response?.text === 'string') {
      rawText = response.text;
    } else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      rawText = response.candidates[0].content.parts[0].text;
    }

    if (!rawText || !rawText.trim()) {
      console.warn('[geminiService] Empty response received from Gemini model.');
      return { ...SAFE_FALLBACK_RESPONSE };
    }

    // Clean and parse JSON bulletproofly
    const cleanedJson = sanitizeJsonString(rawText);
    let parsedJson;
    try {
      parsedJson = JSON.parse(cleanedJson);
    } catch (parseErr) {
      console.error('[geminiService] JSON parse error on Gemini output:', parseErr, 'Raw:', rawText);
      return { ...SAFE_FALLBACK_RESPONSE };
    }

    // Normalize and enforce schema guarantees
    return normalizeParsedResponse(parsedJson);
  } catch (error) {
    console.error('[geminiService] Voice command processing failure:', error?.message || error);
    return { ...SAFE_FALLBACK_RESPONSE };
  }
}

export default {
  processVoiceCommand,
  buildSystemInstruction,
  VOICE_COMMAND_RESPONSE_SCHEMA,
  SAFE_FALLBACK_RESPONSE,
};

