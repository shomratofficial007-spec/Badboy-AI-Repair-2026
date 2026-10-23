// Browser-only voice helpers built on the Web Speech API.
//
// Speech-to-text (dictation) streams audio to the browser vendor's speech
// service, so callers must gate it behind the user's voice-processing
// consent. Text-to-speech runs through local voices.
// Both are unavailable outside web browsers or where the browser does not
// support the API — every helper reports that instead of throwing.

interface SpeechCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError?: (errorType?: string) => void;
  onDone?: () => void;
  onWakeWordDetected?: () => void;
  lang?: string;
}

type RecognitionInstance = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type RecognitionResultLike = {
  isFinal: boolean;
  0?: { transcript?: unknown };
  length: number;
};

type RecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<RecognitionResultLike>;
};

function recognitionConstructor(): (new () => RecognitionInstance) | null {
  if (typeof window === 'undefined') return null;
  const scoped = window as unknown as Record<string, unknown>;
  const ctor = scoped.SpeechRecognition ?? scoped.webkitSpeechRecognition;
  return typeof ctor === 'function'
    ? (ctor as new () => RecognitionInstance)
    : null;
}

export function isDictationAvailable(): boolean {
  return recognitionConstructor() !== null;
}

export function isReadAloudAvailable(): boolean {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return false;
  return typeof window.speechSynthesis?.speak === 'function';
}

/**
  * Check browser microphone permission state if navigator.permissions is available.
  */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  if (typeof window === 'undefined' || !navigator?.permissions?.query) {
    return 'unsupported';
  }
  try {
    const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return result.state;
  } catch {
    return 'unsupported';
  }
}

/** Detect "Oi" / "ওহে" / "JARVIS" wake phrase in transcript string */
export function containsWakePhrase(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const patterns = [
    /\boi\b/i,
    /\bওহে\b/i,
    /\boi\s+jarvis\b/i,
    /\bhey\s+jarvis\b/i,
    /\bহাই\s+জারভিস\b/i,
    /\bজারভিস\b/i,
    /\bjarvis\b/i,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

/** User-friendly localized Bangla error messages for voice recognition issues */
export function getVoiceErrorMessage(errorType?: string): string {
  switch (errorType) {
    case 'not-allowed':
    case 'permission-denied':
    case 'denied':
      return 'মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজার বা ডিভাইসের Settings থেকে Microphone অনুমতি সক্রিয় করুন।';
    case 'no-speech':
      return 'কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন।';
    case 'network':
      return 'ভয়েস রিকগনিশনের জন্য ইন্টারনেট সংযোগ প্রয়োজন। নেটওয়ার্ক পরীক্ষা করুন।';
    case 'audio-capture':
      return 'মাইক্রোফোন ডিভাইসটি পাওয়া যায়নি বা অন্য অ্যাপ ব্যবহার করছে।';
    case 'aborted':
      return 'ভয়েস গ্রহণ ব্যবহারকারী দ্বারা বন্ধ করা হয়েছে।';
    case 'unsupported':
      return 'এই ব্রাউজারে বা ডিভাইসে Web Speech API সমর্থিত নয়। Google Chrome বা Microsoft Edge ব্যবহার করুন।';
    default:
      return 'ভয়েস ইনপুটে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।';
  }
}

/**
 * Note on Background Listening Limitations:
 * Web Speech API runs only while the web application page is active in the foreground.
 * Continuous background listening, lock-screen activation, or hardware wake-word triggering
 * on mobile devices requires a native Android/iOS background service (e.g. via React Native
 * Native Modules or Android Foreground Services).
 */

/** Start one dictation turn with wake-phrase detection and error handling. Returns a cancel function. */
export function dictateOnce(callbacks: SpeechCallbacks): () => void {
  const Ctor = recognitionConstructor();
  if (!Ctor) {
    callbacks.onError?.('unsupported');
    callbacks.onDone?.();
    return () => undefined;
  }

  const recognition = new Ctor();
  recognition.lang = callbacks.lang ?? 'bn-BD';
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finished = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    callbacks.onDone?.();
  };

  recognition.onresult = (event: RecognitionEventLike) => {
    let finalText = '';
    let interimText = '';
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const transcript =
        typeof result[0]?.transcript === 'string' ? (result[0].transcript as string) : '';
      if (result.isFinal) finalText += transcript;
      else interimText += transcript;
    }
    const combined = `${finalText}${interimText}`.trim();

    if (combined) {
      if (containsWakePhrase(combined)) {
        callbacks.onWakeWordDetected?.();
      }
      callbacks.onTranscript(combined, finalText.length > 0 && !interimText);
    }

    if (finalText && !interimText) {
      try {
        recognition.stop();
      } catch {
        // Already stopped.
      }
      finish();
    }
  };

  recognition.onerror = (evt) => {
    finish();
    callbacks.onError?.(evt?.error ?? 'speech_error');
  };

  recognition.onend = () => finish();

  try {
    recognition.start();
  } catch {
    finish();
    callbacks.onError?.('start_failed');
  }

  return () => {
    try {
      recognition.abort();
    } catch {
      // Already ended.
    }
    finish();
  };
}

/** Speak text through the device's local voices. No audio leaves the device. */
export function speak(text: string, lang = 'bn-BD'): void {
  if (!isReadAloudAvailable()) return;
  const clean = text.trim().slice(0, 4000);
  if (!clean) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking(): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
}
