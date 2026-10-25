import assert from 'node:assert';
import test from 'node:test';
import {
  extractYouTubeIntent,
  getYouTubeUrl,
  isGeneralMusicRequest,
} from './youtube.ts';

test('isGeneralMusicRequest - identifies general music requests in Bangla and English', () => {
  assert.strictEqual(isGeneralMusicRequest('গান শোনাও'), true);
  assert.strictEqual(isGeneralMusicRequest('গান বাজাও'), true);
  assert.strictEqual(isGeneralMusicRequest('play a song'), true);
  assert.strictEqual(isGeneralMusicRequest('play music'), true);
  assert.strictEqual(isGeneralMusicRequest('আজকের খবর কি'), false);
});

test('getYouTubeUrl - formats YouTube search URLs correctly', () => {
  const url = getYouTubeUrl('Boro Boro Remix');
  assert.strictEqual(
    url,
    'https://www.youtube.com/results?search_query=Boro%20Boro%20Remix',
  );
});

test('extractYouTubeIntent - detects English song request', () => {
  const intent = extractYouTubeIntent('play Rabindra Sangeet on youtube');
  assert.ok(intent);
  if (!intent) throw new Error('Intent expected');
  assert.strictEqual(intent.query, 'Rabindra Sangeet');
  assert.ok(intent.url.includes('search_query=Rabindra%20Sangeet'));
});

test('extractYouTubeIntent - detects Bangla song request', () => {
  const intent = extractYouTubeIntent('ইউটিউবে রবীন্দ্র সংগীত প্লে করুন');
  assert.ok(intent);
  if (!intent) throw new Error('Intent expected');
  assert.ok(intent.url.includes('youtube.com/results?search_query='));
});

test('extractYouTubeIntent - returns null for non-YouTube queries', () => {
  const intent = extractYouTubeIntent('আজকের আবহাওয়া কেমন?');
  assert.strictEqual(intent, null);
});
