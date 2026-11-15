const SpeechRecognition = typeof window !== 'undefined' 
  ? window.SpeechRecognition || window.webkitSpeechRecognition 
  : null;

export const isSpeechRecognitionSupported = () => Boolean(SpeechRecognition);
export const isSpeechSynthesisSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export const createSpeechRecognizer = ({
  onResult,
  onError,
  onStart,
  onEnd,
  language = 'en-US',
  continuous = false,
  interimResults = false,
}) => {
  if (!isSpeechRecognitionSupported()) {
    console.warn('Speech Recognition is not supported in this browser.');
    return null;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = language;
  recognition.continuous = continuous;
  recognition.interimResults = interimResults;

  recognition.onstart = () => {
    if (onStart) onStart();
  };

  recognition.onresult = (event) => {
    const current = event.resultIndex;
    const transcript = event.results[current][0].transcript;
    if (onResult) onResult(transcript, event.results[current].isFinal);
  };

  recognition.onerror = (event) => {
    if (onError) onError(event.error);
  };

  recognition.onend = () => {
    if (onEnd) onEnd();
  };

  return recognition;
};

export const speakText = (text, { language = 'en-US', rate = 0.9, pitch = 1.0, onEnd } = {}) => {
  if (!isSpeechSynthesisSupported()) {
    console.warn('Speech Synthesis is not supported in this browser.');
    return;
  }

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language;
  utterance.rate = rate;
  utterance.pitch = pitch;

  if (onEnd) {
    utterance.onend = onEnd;
  }

  window.speechSynthesis.speak(utterance);
};

export const stopSpeech = () => {
  if (isSpeechSynthesisSupported()) {
    window.speechSynthesis.cancel();
  }
};

