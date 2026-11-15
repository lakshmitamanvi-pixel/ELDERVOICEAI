const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

export const generateSeniorVoiceResponse = async (userPrompt, context = '') => {
  if (!GEMINI_API_KEY) {
    return 'Hello! I am ElderVoice Assistant. How can I help you today?';
  }

  const systemInstruction = 
    'You are ElderVoice AI, a compassionate, patient, and clear voice assistant for elderly individuals. ' +
    'Keep your answers concise, reassuring, and easy to understand. Speak in short sentences. ' +
    'Prioritize safety, medication guidance, and emotional support.';

  const fullPrompt = context
    ? `Context: ${context}\n\nElderly User says: ${userPrompt}\n\nRespond warmly and directly:`
    : `Elderly User says: ${userPrompt}\n\nRespond warmly and directly:`;

  try {
    const response = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemInstruction}\n\n${fullPrompt}` }],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 250,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini API error: ${response.statusText}`);
    }

    const data = await response.json();
    const candidateText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    return candidateText || 'I am right here with you. How can I help you today?';
  } catch (error) {
    console.error('Failed to query Gemini API:', error);
    return 'I am listening. Please speak again whenever you are ready.';
  }
};

