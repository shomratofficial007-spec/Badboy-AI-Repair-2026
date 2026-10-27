import assert from 'node:assert';
import test from 'node:test';
import {
  containsWakePhrase,
  getVoiceErrorMessage,
  isDictationAvailable,
  isReadAloudAvailable,
} from './voice.ts';

test('wake phrases: English and Bangla aliases are recognized', () => {
  for (const phrase of [
    'Oi', 'oi please', 'ওহে', 'Badboy', 'ব্যাডবয়', 'JARVIS', 'জারভিস',
    'Oi Badboy, ki khobor?', 'ওহে ব্যাডবয়', 'Jarvis, status',
  ]) {
    assert.equal(containsWakePhrase(phrase), true, phrase);
  }
});

test('wake phrases match whole tokens, not substrings inside other words', () => {
  for (const phrase of [
    'boiling water', 'pointless', 'badboys', 'jarvison', 'hello world',
  ]) {
    assert.equal(containsWakePhrase(phrase), false, phrase);
  }
});

test('voice errors map permission, recognition, network and service failures to Bangla guidance', () => {
  const cases: Array<[string, RegExp]> = [
    ['denied', /অনুমতি পাওয়া যায়নি/],
    ['permission_denied', /অনুমতি পাওয়া যায়নি/],
    ['no-speech', /কথা শোনা যায়নি/],
    ['network', /ইন্টারনেট সংযোগ প্রয়োজন/],
    ['audio-capture', /মাইক্রোফোন ডিভাইসটি পাওয়া যায়নি/],
    ['unsupported', /সমর্থিত নয়/],
    ['recognition-service-not-available', /Speech Services by Google/],
    ['start_failed', /ভয়েস চালু করা যায়নি/],
    ['unknown_error_code', /ভয়েস ইনপুটে সমস্যা হয়েছে/],
  ];
  for (const [error, expected] of cases) {
    assert.match(getVoiceErrorMessage(error), expected, error);
  }
});

test('availability checks return booleans without throwing in the test runtime', () => {
  assert.equal(typeof isDictationAvailable(), 'boolean');
  assert.equal(typeof isReadAloudAvailable(), 'boolean');
});
