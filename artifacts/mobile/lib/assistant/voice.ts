// Voice helpers with dual support for Native Mobile (Android / iOS) via
// Expo Speech Recognition & Expo Speech, and Web Speech API fallback for browsers.
//
// Speech-to-text (dictation) streams audio to device / vendor speech recognition,
// so callers must gate it behind the user's voice-processing consent.
// Text-to-speech runs through native TTS engine on mobile or browser local voices on web.

function getPlatformOS(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const rn = require('react-native');
    if (rn?.Platform?.OS) {
      return rn.Platform.OS;
    }
  } catch {
    // Pure web or Node test runner
  }
  if (typeof window !== 'undefined') return 'web';
  return 'node';
}

function getSpeechModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-speech');
  } catch {
    return null;
  }
}

function getSpeechRecognitionModule() {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-speech-recognition');
    return mod?.ExpoSpeechRecognitionModule ?? null;
  } catch {
    return null;
  }
}

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
  const os = getPlatformOS();
  const nativeModule = getSpeechRecognitionModule();
  if (os !== 'web' && os !== 'node') {
    return nativeModule?.isRecognitionAvailable?.() ?? false;
  }
  return (
    (nativeModule?.isRecognitionAvailable?.() ?? false) ||
    recognitionConstructor() !== null
  );
}

export function isReadAloudAvailable(): boolean {
  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node') {
    return typeof speechModule?.speak === 'function';
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    return typeof window.speechSynthesis?.speak === 'function';
  }
  return false;
}

/**
 * Check microphone permission state on Native Android/iOS or Browser Web.
 */
export async function checkMicrophonePermission(): Promise<'granted' | 'denied' | 'prompt' | 'unsupported'> {
  const os = getPlatformOS();
  const nativeModule = getSpeechRecognitionModule();
  if (os !== 'web' && os !== 'node' && nativeModule) {
    try {
      const res = await nativeModule.getPermissionsAsync();
      if (res.status === 'granted') return 'granted';
      if (res.status === 'denied') return 'denied';
      return 'prompt';
    } catch {
      return 'unsupported';
    }
  }

  if (typeof window === 'undefined') return 'unsupported';
  if (navigator?.permissions?.query) {
    try {
      const result = await navigator.permissions.query({ name: 'microphone' as PermissionName });
      return result.state;
    } catch {
      // Fallback to prompt
    }
  }
  return 'prompt';
}

/** Detect "Oi" / "ওহে" / "Badboy" / "JARVIS" wake phrase in transcript string */
export function containsWakePhrase(text: string): boolean {
  const normalized = text.toLowerCase().trim();
  const patterns = [
    /(?:^|[^\p{L}\p{N}])oi(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])ওহে(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])badboy(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])ব্যাডবয়(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])jarvis(?:[^\p{L}\p{N}]|$)/iu,
    /(?:^|[^\p{L}\p{N}])জারভিস(?:[^\p{L}\p{N}]|$)/iu,
  ];
  return patterns.some((pattern) => pattern.test(normalized));
}

/** User-friendly localized Bangla error messages for voice recognition issues */
export function getVoiceErrorMessage(errorType?: string): string {
  switch (errorType) {
    case 'not-allowed':
    case 'permission-denied':
    case 'denied':
    case 'permission_denied':
      return 'মাইক্রোফোন ব্যবহারের অনুমতি পাওয়া যায়নি। ব্রাউজার বা ডিভাইসের Settings থেকে Microphone অনুমতি সক্রিয় করুন।';
    case 'no-speech':
    case 'no_match':
    case 'speech_timeout':
      return 'কোনো কথা শোনা যায়নি। আবার চেষ্টা করুন।';
    case 'network':
    case 'network_failure':
      return 'ভয়েস রিকগনিশনের জন্য ইন্টারনেট সংযোগ প্রয়োজন। নেটওয়ার্ক পরীক্ষা করুন।';
    case 'audio-capture':
    case 'audio_extra':
      return 'মাইক্রোফোন ডিভাইসটি পাওয়া যায়নি বা অন্য অ্যাপ ব্যবহার করছে।';
    case 'aborted':
      return 'ভয়েস গ্রহণ ব্যবহারকারী দ্বারা বন্ধ করা হয়েছে।';
    case 'start_failed':
    case 'speech_error':
    case 'recognition-service-not-available':
    case 'service-not-available':
      return 'ভয়েস চালু করা যায়নি। Android Settings থেকে Google app ও Speech Services by Google আপডেট/সক্রিয় করুন, Microphone অনুমতি দিন, তারপর অ্যাপটি আবার খুলুন।';
    case 'unsupported':
    case 'not_supported':
      return 'এই ডিভাইসে বা ব্রাউজারে ভয়েস রিকগনিশন সমর্থিত নয়। Google Speech Services বা উপযুক্ত সার্ভিস ইনস্টল আছে কিনা যাচাই করুন।';
    default:
      return 'ভয়েস ইনপুটে সমস্যা হয়েছে। পুনরায় চেষ্টা করুন।';
  }
}

/**
 * Note on Background Listening Limitations:
 * Web Speech API and Native Mobile Speech Recognition run while the application is active in the foreground.
 * Continuous background listening, lock-screen activation, or hardware wake-word triggering on mobile devices
 * requires a dedicated native Android/iOS background service / DSP chip hardware integration.
 * In this app, real-time "Oi" wake-word detection triggers dynamically during active foreground dictation sessions.
 */

/** Start one dictation turn with wake-phrase detection and error handling. Returns a cancel function. */
export function dictateOnce(callbacks: SpeechCallbacks): () => void {
  const os = getPlatformOS();
  const nativeModule = getSpeechRecognitionModule();
  const useNative = (os !== 'web' && os !== 'node' && nativeModule) || Boolean(nativeModule?.isRecognitionAvailable?.());

  if (useNative && nativeModule) {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      callbacks.onDone?.();
    };

    const subscriptions: Array<{ remove: () => void }> = [];
    const cleanup = () => {
      subscriptions.forEach((sub) => {
        try {
          sub.remove();
        } catch {
          // Ignore removal errors
        }
      });
      subscriptions.length = 0;
    };

    const startNative = async () => {
      try {
        const perm = await nativeModule.requestPermissionsAsync();
        if (!perm.granted) {
          callbacks.onError?.('permission-denied');
          finish();
          return;
        }

        const resSub = nativeModule.addListener(
          'result',
          (event: { results?: Array<{ transcript?: string }>; isFinal?: boolean }) => {
            const results = event.results ?? [];
            if (!results.length) return;
            const transcript = results[0]?.transcript ?? '';
            const isFinal = event.isFinal ?? false;

            if (transcript) {
              if (containsWakePhrase(transcript)) {
                callbacks.onWakeWordDetected?.();
              }
              callbacks.onTranscript(transcript, isFinal);
            }

            if (isFinal) {
              try {
                nativeModule.stop();
              } catch {
                // Ignore
              }
              cleanup();
              finish();
            }
          },
        );
        subscriptions.push(resSub);

        const errSub = nativeModule.addListener('error', (event: { error?: string }) => {
          cleanup();
          finish();
          callbacks.onError?.(event.error ?? 'speech_error');
        });
        subscriptions.push(errSub);

        const endSub = nativeModule.addListener('end', () => {
          cleanup();
          finish();
        });
        subscriptions.push(endSub);

        nativeModule.start({
          lang: callbacks.lang ?? 'bn-BD',
          interimResults: true,
          continuous: false,
          maxAlternatives: 1,
        });
      } catch {
        cleanup();
        finish();
        callbacks.onError?.('start_failed');
      }
    };

    void startNative();

    return () => {
      try {
        nativeModule.abort();
      } catch {
        // Ignore abort error
      }
      cleanup();
      finish();
    };
  }

  // Web Speech API fallback for web browsers
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

/** Speak text through the device's native TTS engine or browser local voices. */
export function speak(text: string, lang = 'bn-BD'): void {
  const clean = text.trim().slice(0, 4000);
  if (!clean) return;

  stopSpeaking();

  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node' && speechModule) {
    try {
      speechModule.speak(clean, {
        language: lang,
        pitch: 1.0,
        rate: 1.0,
      });
      return;
    } catch {
      // Fallback
    }
  }

  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = lang;
      window.speechSynthesis.speak(utterance);
    } catch {
      // Ignore
    }
  }
}

export function stopSpeaking(): void {
  const os = getPlatformOS();
  const speechModule = getSpeechModule();
  if (os !== 'web' && os !== 'node' && speechModule) {
    try {
      speechModule.stop();
    } catch {
      // Ignore
    }
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // Ignore
    }
  }
}
