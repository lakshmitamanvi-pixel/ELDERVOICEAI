import React, { useState, useEffect } from 'react';
import { Lock, ShieldCheck, KeyRound, Delete, AlertCircle, Eye, EyeOff } from 'lucide-react';

const DEFAULT_PIN = '1984';
const SESSION_STORAGE_KEY = 'eldervoice_caretaker_session';

export const PinAuthWrapper = ({ children, onLockDashboard }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pin, setPin] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [shake, setShake] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(SESSION_STORAGE_KEY);
      if (stored === 'authorized') {
        setIsAuthenticated(true);
      }
    } catch {
      // sessionStorage unavailable
    }
  }, []);

  const handleKeyPress = (digit) => {
    if (pin.length < 4) {
      const nextPin = pin + digit;
      setPin(nextPin);
      setErrorMessage('');
      if (nextPin.length === 4) {
        verifyPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    setPin((prev) => prev.slice(0, -1));
    setErrorMessage('');
  };

  const handleClear = () => {
    setPin('');
    setErrorMessage('');
  };

  const verifyPin = (candidatePin) => {
    setIsVerifying(true);
    setTimeout(() => {
      const targetPin = localStorage.getItem('eldervoice_caretaker_custom_pin') || DEFAULT_PIN;
      if (candidatePin === targetPin) {
        try {
          sessionStorage.setItem(SESSION_STORAGE_KEY, 'authorized');
        } catch {
          // ignore storage error
        }
        setIsAuthenticated(true);
        setErrorMessage('');
      } else {
        setShake(true);
        setErrorMessage('Incorrect Security PIN. Please try again.');
        setTimeout(() => setShake(false), 600);
        setPin('');
      }
      setIsVerifying(false);
    }, 250);
  };

  const handleSignOut = () => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
    } catch {
      // ignore storage error
    }
    setIsAuthenticated(false);
    setPin('');
    setErrorMessage('');
    if (onLockDashboard) {
      onLockDashboard();
    }
  };

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (isAuthenticated) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        handleDelete();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        handleClear();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isAuthenticated]);

  if (isAuthenticated) {
    return (
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3 bg-elderBlue-100 border-2 border-elderBlue-300 rounded-2xl px-4 sm:px-5 py-3 mb-6 min-w-0">
          <div className="flex items-center gap-3 min-w-0">
            <ShieldCheck className="w-6 h-6 text-emeraldSuccess-700 stroke-[2.5] flex-shrink-0" aria-hidden="true" />
            <span className="text-base sm:text-lg font-bold text-elderBlue-950 break-words">
              Authenticated Caretaker Session Active
            </span>
          </div>
          <button
            type="button"
            onClick={handleSignOut}
            aria-label="Lock Caretaker Dashboard"
            className="w-full sm:w-auto min-h-[48px] px-4 py-2 bg-elderBlue-900 text-warmWhite hover:bg-elderBlue-950 font-bold text-base rounded-xl transition-colors focus:ring-4 focus:ring-elderBlue-400"
          >
            Lock Dashboard
          </button>
        </div>
        {typeof children === 'function' ? children({ onSignOut: handleSignOut }) : children}
      </div>
    );
  }

  return (
    <div className="max-w-md w-full mx-auto my-4 sm:my-8 p-4 sm:p-8 bg-warmWhite-paper border-3 border-elderBlue-300 rounded-3xl shadow-2xl">
      <div className="text-center">
        <div className="inline-flex p-4 bg-elderBlue-100 border-2 border-elderBlue-300 rounded-2xl text-elderBlue-900 mb-3">
          <Lock className="w-10 h-10 stroke-[2.5]" aria-hidden="true" />
        </div>
        <h2 className="text-3xl font-extrabold text-elderBlue-950">
          Caretaker Security Gate
        </h2>
        <p className="text-lg text-elderBlue-800 font-medium mt-1">
          Enter your 4-digit PIN to access medical records and controls.
        </p>

        {/* Demo PIN helper pill */}
        <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 bg-amber-100 border border-amber-300 text-amber-950 rounded-full text-base font-semibold">
          <KeyRound className="w-4 h-4 stroke-[2.5]" aria-hidden="true" />
          <span>Demo PIN: <strong>1984</strong></span>
        </div>
      </div>

      {/* 4-Digit Display Slots */}
      <div
        className={`flex justify-center items-center gap-2.5 sm:gap-4 my-6 sm:my-8 transition-transform ${
          shake ? 'translate-x-2' : ''
        }`}
        aria-live="polite"
      >
        {[0, 1, 2, 3].map((index) => {
          const digit = pin[index];
          const isFilled = Boolean(digit);
          return (
            <div
              key={index}
              className={`w-14 h-16 sm:w-16 sm:h-20 rounded-2xl border-3 flex items-center justify-center text-2xl sm:text-3xl font-extrabold shadow-sm transition-all ${
                isFilled
                  ? 'border-elderBlue-800 bg-elderBlue-50 text-elderBlue-950 scale-105'
                  : 'border-elderBlue-200 bg-white text-elderBlue-400'
              }`}
            >
              {isFilled ? (showPin ? digit : '●') : ''}
            </div>
          );
        })}
      </div>

      {/* Visibility Toggle & Error Notification */}
      <div className="flex flex-wrap items-center justify-between gap-2 min-h-[30px] mb-4">
        <button
          type="button"
          onClick={() => setShowPin(!showPin)}
          className="flex items-center gap-1.5 text-base font-bold text-elderBlue-700 hover:text-elderBlue-950 focus:outline-none"
        >
          {showPin ? (
            <>
              <EyeOff className="w-5 h-5" aria-hidden="true" />
              <span>Hide PIN</span>
            </>
          ) : (
            <>
              <Eye className="w-5 h-5" aria-hidden="true" />
              <span>Reveal PIN</span>
            </>
          )}
        </button>

        {errorMessage && (
          <div className="flex items-center gap-1.5 text-crimsonAlert-700 text-base font-bold">
            <AlertCircle className="w-5 h-5 stroke-[2.5]" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
        )}
      </div>

      {/* High-Contrast Accessible Keypad: min-h-[60px] */}
      <div className="grid grid-cols-3 gap-3">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
          <button
            key={digit}
            type="button"
            onClick={() => handleKeyPress(digit)}
            disabled={isVerifying || pin.length >= 4}
            className="min-h-[64px] rounded-2xl bg-white border-2 border-elderBlue-200 text-3xl font-bold text-elderBlue-950 hover:bg-elderBlue-50 active:bg-elderBlue-200 transition-colors shadow-sm focus:outline-none focus:ring-4 focus:ring-elderBlue-400"
          >
            {digit}
          </button>
        ))}

        <button
          type="button"
          onClick={handleClear}
          disabled={isVerifying || pin.length === 0}
          aria-label="Clear PIN entry"
          className="min-h-[64px] rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200 text-xl font-bold text-elderBlue-800 hover:bg-elderBlue-100 active:bg-elderBlue-200 transition-colors shadow-sm focus:outline-none focus:ring-4 focus:ring-elderBlue-400"
        >
          Clear
        </button>

        <button
          type="button"
          onClick={() => handleKeyPress('0')}
          disabled={isVerifying || pin.length >= 4}
          className="min-h-[64px] rounded-2xl bg-white border-2 border-elderBlue-200 text-3xl font-bold text-elderBlue-950 hover:bg-elderBlue-50 active:bg-elderBlue-200 transition-colors shadow-sm focus:outline-none focus:ring-4 focus:ring-elderBlue-400"
        >
          0
        </button>

        <button
          type="button"
          onClick={handleDelete}
          disabled={isVerifying || pin.length === 0}
          aria-label="Delete last digit"
          className="min-h-[64px] rounded-2xl bg-elderBlue-50 border-2 border-elderBlue-200 flex items-center justify-center text-elderBlue-800 hover:bg-elderBlue-100 active:bg-elderBlue-200 transition-colors shadow-sm focus:outline-none focus:ring-4 focus:ring-elderBlue-400"
        >
          <Delete className="w-8 h-8 stroke-[2.5]" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
};

export default PinAuthWrapper;

