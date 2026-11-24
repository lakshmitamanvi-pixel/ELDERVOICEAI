export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', label: 'English (US)', flag: '🇺🇸', native: 'English' },
  { code: 'hi-IN', label: 'Hindi', flag: '🇮🇳', native: 'हिन्दी' },
  { code: 'te-IN', label: 'Telugu', flag: '🇮🇳', native: 'తెలుగు' },
  { code: 'es-ES', label: 'Spanish', flag: '🇪🇸', native: 'Español' },
  { code: 'fr-FR', label: 'French', flag: '🇫🇷', native: 'Français' },
  { code: 'de-DE', label: 'German', flag: '🇩🇪', native: 'Deutsch' },
  { code: 'zh-CN', label: 'Mandarin', flag: '🇨🇳', native: '中文' },
];

export const MULTILINGUAL_STRINGS = {
  'en-US': {
    greeting: 'Good morning! How are you feeling today?',
    pressToSpeak: 'Press to Speak',
    listening: 'Listening to your voice...',
    emergencyAlert: 'EMERGENCY SOS',
    confirmAlert: 'Alerting Family & Caretaker',
    medicationReminder: 'Today’s Medications',
    callCaretaker: 'Call Caretaker',
    helpPrompt: 'I need assistance',
    caretakerTitle: 'Caretaker Dashboard',
    statusNormal: 'All Vitals Normal',
    statusAlert: 'Needs Attention',
    thinkingFiller: 'One moment, please...',
  },
  'es-ES': {
    greeting: '¡Buenos días! ¿Cómo se siente hoy?',
    pressToSpeak: 'Presione para Hablar',
    listening: 'Escuchando su voz...',
    emergencyAlert: 'EMERGENCIA SOS',
    confirmAlert: 'Alertando a Familia y Cuidador',
    medicationReminder: 'Medicamentos de Hoy',
    callCaretaker: 'Llamar al Cuidador',
    helpPrompt: 'Necesito ayuda',
    caretakerTitle: 'Panel del Cuidador',
    statusNormal: 'Todo Normal',
    statusAlert: 'Requiere Atención',
    thinkingFiller: 'Un momento, por favor...',
  },
  'hi-IN': {
    greeting: 'नमस्ते! आज आप कैसा महसूस कर रहे हैं?',
    pressToSpeak: 'बोलने के लिए दबाएं',
    listening: 'आपकी आवाज सुन रहे हैं...',
    emergencyAlert: 'आपातकालीन सहायता (SOS)',
    confirmAlert: 'परिवार और देखभालकर्ता को सूचित किया जा रहा है',
    medicationReminder: 'आज की दवाइयां',
    callCaretaker: 'देखभालकर्ता को कॉल करें',
    helpPrompt: 'मुझे मदद चाहिए',
    caretakerTitle: 'देखभालकर्ता डैशबोर्ड',
    statusNormal: 'सब सामान्य है',
    statusAlert: 'ध्यान देने की आवश्यकता है',
    thinkingFiller: 'कृपया एक पल रुकें...',
  },
  'te-IN': {
    greeting: 'నమస్కారం! ఈరోజు మీకు ఎలా ఉంది?',
    pressToSpeak: 'మాట్లాడటానికి నొక్కండి',
    listening: 'మీ మాటలను వింటున్నాము...',
    emergencyAlert: 'అత్యవసర సహాయం (SOS)',
    confirmAlert: 'కుటుంబానికి మరియు సంరక్షకుడికి తెలియజేస్తున్నాం',
    medicationReminder: 'నేటి మందులు',
    callCaretaker: 'సంరక్షకుడిని సంప్రదించండి',
    helpPrompt: 'నాకు సహాయం కావాలి',
    caretakerTitle: 'సంరక్షకుని డాష్‌బోర్డ్',
    statusNormal: 'అన్నీ సాధారణ స్థితిలో ఉన్నాయి',
    statusAlert: 'శ్రద్ధ అవసరం',
    thinkingFiller: 'దయచేసి ఒక నిమిషం ఆగండి...',
  },
};

export const getTranslation = (key, langCode = 'en-US') => {
  const dictionary = MULTILINGUAL_STRINGS[langCode] || MULTILINGUAL_STRINGS['en-US'];
  return dictionary[key] || MULTILINGUAL_STRINGS['en-US'][key] || key;
};

