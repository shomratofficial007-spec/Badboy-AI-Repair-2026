import assert from 'node:assert';
import test from 'node:test';
import { extractYouTubeIntent } from './youtube.ts';

test('extractYouTubeIntent - detects English song request', () => {
  const intent = extractYouTubeIntent('play Rabindra Sangeet on youtube');
  assert.ok(intent);
  assert.strictEqual(intent.query, 'Rabindra Sangeet');
  assert.ok(intent.url.includes('search_query=Rabindra%20Sangeet'));
});

test('extractYouTubeIntent - detects Bangla song request', () => {
  const intent = extractYouTubeIntent('ইউটিউবে রবীন্দ্র সংগীত প্লে করুন');
  assert.ok(intent);
  assert.ok(intent.url.includes('youtube.com/results?search_query='));
});

test('extractYouTubeIntent - returns null for non-YouTube queries', () => {
  const intent = extractYouTubeIntent('আজকের আবহাওয়া কেমন?');
  assert.strictEqual(intent, null);
});
