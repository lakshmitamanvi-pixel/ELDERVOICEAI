import { handleVoice, MODEL } from './geminiService.js';

export const GEMINI_MODEL = MODEL;

export const generateSeniorVoiceResponse = async (userPrompt) => {
  const result = await handleVoice(userPrompt);
  return result?.reply || '';
};

export default {
  generateSeniorVoiceResponse,
  GEMINI_MODEL,
};
