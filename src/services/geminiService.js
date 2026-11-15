import { GoogleGenAI, Type } from '@google/genai';

/**
 * Single source for the Gemini model name read from environment.
 * Fallback: "gemini-2.5-flash".
 */
export const MODEL =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_GEMINI_MODEL) ||
  (typeof process !== 'undefined' && process?.env?.VITE_GEMINI_MODEL) ||
  'gemini-2.5-flash';

export const MODELS = Array.from(new Set([MODEL, 'gemini-2.5-flash']));

/**
 * Supported intent classifications.
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

/**
 * Fixed deterministic replies mapped by intent and language.
 * Note: Hindi (hi) and Telugu (te) translations below - needs native-speaker review
 */
export const REPLIES = {
  medication: {
    en: 'Please refer the medicines section.',
    hi: 'कृपया दवाई वाला अनुभाग देखें।',
    te: 'దయచేసి మందుల విభాగాన్ని చూడండి.',
  },
  emergency: {
    en: 'Press the red button on top of the screen for SOS.',
    hi: 'आपातकालीन सहायता (SOS) के लिए स्क्रीन के ऊपर लाल बटन दबाएं।',
    te: 'అత్యవసర సహాయం (SOS) కోసం స్క్రీన్ పైభాగంలో ఉన్న ఎరుపు బటన్‌ను నొక్కండి.',
  },
  call_family: {
    en: 'You can call your daughter Sarah at (555) 912-3456 or press SOS to alert family.',
    hi: 'आप अपनी बेटी सारा को (555) 912-3456 पर कॉल कर सकते हैं या परिवार को सूचित करने के लिए SOS दबाएं।',
    te: 'మీరు మీ కుమార్తె సారాకు (555) 912-3456 నంబర్‌లో కాల్ చేయవచ్చు లేదా కుటుంబానికి తెలియజేయడానికి SOS నొక్కండి.',
  },
  appointment: {
    en: 'Please check your upcoming appointments in the schedule section.',
    hi: 'कृपया शेड्यूल अनुभाग में अपनी आगामी अपॉइंटमेंट देखें।',
    te: 'దయచేసి షెడ్యూల్ విభాగంలో మీ రాబోయే అపాయింట్‌మెంట్‌లను తనిఖీ చేయండి.',
  },
  symptom: {
    en: 'Please consult your doctor immediately regarding any discomfort. Do not change medications on your own.',
    hi: 'कृपया किसी भी परेशानी के लिए तुरंत अपने डॉक्टर से संपर्क करें। अपने आप कोई दवा न लें।',
    te: 'ఏదైనా అసౌకర్యం ఉంటే వెంటనే మీ వైద్యుడిని సంప్రదించండి. మీ స్వంతంగా మందులు మార్చవద్దు.',
  },
  greeting: {
    en: 'Hello! I am right here with you. How can I help you today?',
    hi: 'नमस्ते! मैं आपके साथ यहीं हूँ। आज मैं आपकी क्या मदद कर सकता हूँ?',
    te: 'నమస్కారం! నేను మీతోనే ఉన్నాను. ఈరోజు నేను మీకు ఎలా సహాయపడగలను?',
  },
  unknown: {
    en: 'I am listening. Please speak again whenever you are ready.',
    hi: 'मैं सुन रहा हूँ। जब भी आप तैयार हों, कृपया फिर से बोलें।',
    te: 'నేను వింటున్నాను. మీరు సిద్ధంగా ఉన్నప్పుడు దయచేసి మళ్ళీ మాట్లాడండి.',
  },
};

/**
 * Emergency trigger keywords in English, Hindi, and Telugu.
 * Checked BEFORE making any API call to guarantee instantaneous emergency response.
 */
export const EMERGENCY_WORDS =
  /\b(help|emergency|urgent|right now|chest pain|can'?t breathe|cannot breathe|fell|fallen|ambulance)\b|बचाओ|मदद|सहायता|సహాయం|అత్యవసరం/i;

/**
 * Strict System Prompt: Classifier ONLY.
 * Model outputs intent and language only, NEVER writes responses.
 */
export const SYSTEM = `You are a strict intent and language classifier for ElderVoice AI, a voice assistant for senior citizens.
Your ONLY role is to classify the user's transcript into exactly one intent and detect the spoken language.
NEVER generate conversational replies, advice, answers, or commentary. Output valid JSON adhering strictly to the schema.

INTENTS & DEFINITIONS:
1. medication: Inquiries, reminders, or questions about pills, prescriptions, medicines, schedules, or dosages.
   Example: "What medications should I take today?"
2. emergency: Urgent physical distress, acute pain, falls, breathlessness, accidents, feeling unsafe, immediate danger, or SOS help requests.
   Example: "I need assistance right now"
3. call_family: Asking to call, contact, reach, talk to, or message family members, daughters, sons, or caretakers.
   Example: "How do I reach my family?"
4. appointment: Inquiries or schedule checks regarding doctor visits, clinic appointments, medical checkups, or consultations.
   Example: "When is my next doctor appointment?"
5. symptom: Physical complaints, feeling sick, headache, nausea, mild pain, dizziness, fatigue, or reporting health symptoms.
   Example: "I have a slight headache"
6. greeting: Polite hellos, good morning, greetings, thank you, pleasantries, or companion chat openings.
   Example: "Good morning, how are you?"
7. unknown: Unclear input, background chatter, irrelevant statements, or statements not fitting any intent above.
   Example: "The sky is blue today"

CLASSIFICATION RULES:
- RULE: If you are unsure between "emergency" and ANY other intent, you MUST choose "emergency". Senior safety is paramount.
- Output language as "en" (English), "hi" (Hindi), or "te" (Telugu). If uncertain or mixed, default to "en".`;

/**
 * JSON Schema enforcing intent and language classification only.
 */
export const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    intent: {
      type: Type.STRING,
      enum: INTENTS,
    },
    language: {
      type: Type.STRING,
      enum: ['en', 'hi', 'te'],
    },
  },
  required: ['intent', 'language'],
};

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
    'Please set VITE_GEMINI_API_KEY in your .env file.'
  );
}

// Safely initialize the client instance without duplicate creations
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
 * Helper to get or lazily initialize the GenAI client.
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
 * Quick script/character-based language detection fallback.
 */
const detectLanguageFast = (text = '') => {
  if (/[\u0C00-\u0C7F]/.test(text)) return 'te';
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  return 'en';
};

/**
 * Calls Gemini generateContent with automatic fallback across candidate MODELS.
 *
 * @param {object} params Parameters passed to client.models.generateContent (contents, config, etc.)
 * @returns {Promise<any>}
 */
export async function callWithFallback(params) {
  const client = getClient();
  if (!client) {
    throw new Error('[geminiService] Cannot initialize client: VITE_GEMINI_API_KEY is not defined.');
  }

  let lastError;
  for (const m of MODELS) {
    try {
      return await client.models.generateContent({ ...params, model: m });
    } catch (err) {
      lastError = err;
      const status = Number(err?.status ?? err?.response?.status ?? err?.statusCode);
      if (status === 429 || status === 500 || status === 503 || status === 404) {
        console.warn(`[geminiService] Model ${m} failed with status ${err?.status || status}: ${err?.message || err}`);
        continue;
      }
      throw err;
    }
  }

  throw lastError;
}

/**
 * Main voice handling function:
 * 1. Checks EMERGENCY_WORDS regex locally BEFORE any API call.
 * 2. Uses Gemini as intent/language classifier only.
 * 3. Returns { intent, reply } with fixed deterministic replies from REPLIES map.
 * 4. Catches all errors safely without crashing or leaving UI blank.
 *
 * @param {string} transcript Spoken transcript from the senior user.
 * @returns {Promise<{ intent: string, reply: string }>}
 */
export async function handleVoice(transcript) {
  if (!transcript || typeof transcript !== 'string' || !transcript.trim()) {
    return {
      intent: 'unknown',
      reply: REPLIES.unknown.en,
    };
  }

  const cleanText = transcript.trim();
  const fastLang = detectLanguageFast(cleanText);

  // Run EMERGENCY_WORDS regex BEFORE the API call; on match return emergency reply immediately, no API call.
  if (EMERGENCY_WORDS.test(cleanText)) {
    return {
      intent: 'emergency',
      reply: REPLIES.emergency[fastLang] || REPLIES.emergency.en,
    };
  }

  const client = getClient();
  if (!client) {
    console.warn('[geminiService] Client uninitialized. Falling back to unknown reply.');
    return {
      intent: 'unknown',
      reply: REPLIES.unknown[fastLang] || REPLIES.unknown.en,
    };
  }

  try {
    const response = await callWithFallback({
      contents: cleanText,
      config: {
        systemInstruction: SYSTEM,
        temperature: 0,
        responseMimeType: 'application/json',
        responseSchema: RESPONSE_SCHEMA,
      },
    });

    let rawText = '';
    if (typeof response?.text === 'string') {
      rawText = response.text;
    } else if (response?.candidates?.[0]?.content?.parts?.[0]?.text) {
      rawText = response.candidates[0].content.parts[0].text;
    }

    if (!rawText || !rawText.trim()) {
      return {
        intent: 'unknown',
        reply: REPLIES.unknown[fastLang] || REPLIES.unknown.en,
      };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[geminiService] Failed to parse JSON response:', parseErr, 'Raw:', rawText);
      return {
        intent: 'unknown',
        reply: REPLIES.unknown[fastLang] || REPLIES.unknown.en,
      };
    }

    const intent = INTENTS.includes(parsed?.intent) ? parsed.intent : 'unknown';
    const lang = ['en', 'hi', 'te'].includes(parsed?.language) ? parsed.language : fastLang;

    const reply = REPLIES[intent]?.[lang] ?? REPLIES[intent]?.en ?? REPLIES.unknown.en;

    return {
      intent,
      reply,
    };
  } catch (error) {
    console.error(
      `[geminiService] Error calling model '${MODEL}': status=${error?.status || 'unknown'}, message=${error?.message || error}`
    );
    return {
      intent: 'unknown',
      reply: REPLIES.unknown[fastLang] || REPLIES.unknown.en,
    };
  }
}

/**
 * Backwards compatibility adapter for processVoiceCommand callers.
 */
export async function processVoiceCommand(transcript) {
  const result = await handleVoice(transcript);
  return {
    intent: result.intent,
    replyText: result.reply,
    actionTrigger: {
      type: result.intent === 'emergency' ? 'TRIGGER_ALERT' : (result.intent === 'medication' ? 'CONFIRM_MEDICATION' : 'NONE'),
      targetId: null,
    },
  };
}

export const SAFE_FALLBACK_RESPONSE = Object.freeze({
  intent: 'unknown',
  replyText: REPLIES.unknown.en,
  actionTrigger: {
    type: 'NONE',
    targetId: null,
  },
});

export default {
  handleVoice,
  processVoiceCommand,
  MODEL,
  INTENTS,
  REPLIES,
  EMERGENCY_WORDS,
  SYSTEM,
  SAFE_FALLBACK_RESPONSE,
};
