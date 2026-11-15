# ElderVoice AI 🎙️👵

> Accessible Voice Companion & Real-Time Caretaker Ecosystem for Elderly Independence.

ElderVoice AI is an accessibility-first React application designed to support elderly individuals and their caregivers. It features high-contrast UI components, tactile touch targets, conversational voice interactions, daily medication adherence monitoring, and emergency SOS dispatching.

---

## 🌟 Key Features

### 👵 Senior Voice Companion Interface
* **Tactile Accessibility**: Minimum touch targets of `min-h-[60px]` and typography scales starting at `text-lg` (`18px`) for maximum legibility.
* **WCAG AAA Color Contrast**: Deep accessible blues (`elderBlue`), eye-friendly warm whites (`warmWhite`), emerald success badges, and high-visibility crimson alert indicators.
* **Voice-Activated Companion**: Real-time speech recognition and text-to-speech engine powered by Web Speech API and Gemini AI.
* **Emergency SOS**: One-touch SOS help button that notifies family and caregivers via audio sirens and email alerts.
* **Daily Medication Checklist**: Interactive, accessible reminder cards.

### 🛡️ Caretaker Management Dashboard
* **4-Digit PIN Security Gate**: Protected session access (default demo PIN: `1984`) with session persistence.
* **Real-Time Firestore Synchronization (`onSnapshot`)**:
  * `profiles`: Medical directives, emergency contacts hierarchy, and reminiscence memory vault.
  * `medications`: Live schedule tracking with status indicators (`pending`, `confirmed`, `missed`).
  * `appointments`: Doctor consultations, locations, and care visit tracking.
* **Live Adherence Tracker**: Dynamic compliance calculation with color-coded status badges.
* **Memory Vault**: Preserves family connections, personal history, and caretaker routines.

---

## 🛠️ Tech Stack

* **Framework**: React 18 + Vite
* **Styling**: Tailwind CSS (custom high-contrast accessible theme)
* **Icons**: `lucide-react`
* **Backend & Real-Time DB**: Firebase (Firestore, Auth)
* **Alert Notifications**: `emailjs-com`
* **Speech Engine**: Web Speech API (`SpeechRecognition`, `SpeechSynthesis`)

---

## 🚀 Getting Started

### 1. Clone the repository
```bash
git clone https://github.com/lakshmitamanvi-pixel/ELDERVOICEAI.git
cd ELDERVOICEAI
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Create a `.env` file in the project root (see `.env.example`):
```env
VITE_FIREBASE_API_KEY=your_firebase_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### 4. Run development server
```bash
npm run dev
```

### 5. Build for production
```bash
npm run build
```

---

## 🔒 Security PIN
* **Default Demo Caretaker PIN**: `1984`
