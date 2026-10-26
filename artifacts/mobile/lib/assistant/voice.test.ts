import assert from 'node:assert';
import test from 'node:test';
import {
  containsWakePhrase,
  getVoiceErrorMessage,
  isDictationAvailable,
  isReadAloudAvailable,
} from './voice.ts';

test('containsWakePhrase - identifies "Oi", "Badboy", and "JARVIS" wake words in various languages', () => {
  assert.strictEqual(containsWakePhrase('Oi Badboy, ki khobor?'), true);
  assert.strictEqual(containsWakePhrase('Hey Badboy play a song'), true);
  assert.strictEqual(containsWakePhrase('ব্যাডবয় কেমন আছো'), true);
  assert.strictEqual(containsWakePhrase('Oi, jarvis, system status?'), true);
  assert.strictEqual(containsWakePhrase('ওহে ব্যাডবয়'), true);
  assert.strictEqual(containsWakePhrase('hello world without wake word'), false);
});

test('getVoiceErrorMessage - maps error types to clear user-friendly Bangla messages', () => {
  assert.match(getVoiceErrorMessage('denied'), /অনুমতি পাওয়া যায়নি/);
  assert.match(getVoiceErrorMessage('permission_denied'), /অনুমতি পাওয়া যায়নি/);
  assert.match(getVoiceErrorMessage('no-speech'), /কথা শোনা যায়নি/);
  assert.match(getVoiceErrorMessage('network'), /ইন্টারনেট সংযোগ প্রয়োজন/);
  assert.match(getVoiceErrorMessage('audio-capture'), /মাইক্রোফোন ডিভাইসটি পাওয়া যায়নি/);
  assert.match(getVoiceErrorMessage('unsupported'), /সমর্থিত নয়/);
  assert.match(getVoiceErrorMessage('unknown_error_code'), /ভয়েস ইনপুটে সমস্যা হয়েছে/);
});

test('isDictationAvailable & isReadAloudAvailable - boolean functions evaluate without throwing', () => {
  assert.strictEqual(typeof isDictationAvailable(), 'boolean');
  assert.strictEqual(typeof isReadAloudAvailable(), 'boolean');
});
