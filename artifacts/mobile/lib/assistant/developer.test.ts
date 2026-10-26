import assert from 'node:assert';
import test from 'node:test';
import {
  generateDevelopmentPlan,
  getProjectBrainSummary,
  runAutoQASuite,
  getPluginRegistryStatus,
  executeAgentTask,
  detectMessageLanguage,
  performLiveWebResearch,
  buildStructuredReasoning,
  DEFAULT_REPO_CONFIG,
  createGitHubPullRequest,
} from './developer.ts';

test('detectMessageLanguage - identifies Bengali, Banglish, English, and mixed script', () => {
  assert.strictEqual(detectMessageLanguage('আজকের খবর কী?'), 'bn');
  assert.strictEqual(detectMessageLanguage('Kemon acho bhai, ki korcho?'), 'banglish');
  assert.strictEqual(detectMessageLanguage('What is the weather today?'), 'en');
  assert.strictEqual(detectMessageLanguage('Hello ভাই কেমন আছেন?'), 'mixed');
});

test('buildStructuredReasoning - generates 5-point structured reasoning response', () => {
  const res = buildStructuredReasoning({
    prompt: 'How to deploy Expo app?',
    lang: 'bn',
    answerText: 'Expo web export pnpm run build দিয়ে প্রস্তুত করুন।',
    explanationText: 'Cloudflare Pages wrangler pages deploy ডিরেক্টরি ব্যবহার করে।',
    sources: ['[Cloudflare Pages Doc](https://pages.cloudflare.com)'],
  });

  assert.ok(res.rawFormattedText.includes('১. মূল উত্তর'));
  assert.ok(res.rawFormattedText.includes('২. ব্যাখ্যা'));
  assert.ok(res.rawFormattedText.includes('৩. তথ্যসূত্র ও উৎস'));
  assert.ok(res.rawFormattedText.includes('৪. সীমাবদ্ধতা'));
});

test('performLiveWebResearch - deterministic mock test for successful search result', async () => {
  const originalFetch = globalThis.fetch;
  const mockHtml = `
    <html><body>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexpo.dev%2Fdocs">Expo Documentation</a>
      <a class="result__snippet">Build one project that runs natively on all devices using Expo React Native framework.</a>
    </body></html>
  `;

  globalThis.fetch = async () => new Response(mockHtml, { status: 200 });

  try {
    const research = await performLiveWebResearch('Expo React Native 52');
    assert.strictEqual(research.query, 'Expo React Native 52');
    assert.strictEqual(research.isFallbackLinkOnly, false);
    assert.strictEqual(research.results.length, 1);
    assert.strictEqual(research.results[0].title, 'Expo Documentation');
    assert.strictEqual(research.results[0].url, 'https://expo.dev/docs');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for empty search results fallback link', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('<html><body>No results</body></html>', { status: 200 });

  try {
    const research = await performLiveWebResearch('Empty Search Query');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.results.length, 1);
    assert.ok(research.results[0].url.includes('duckduckgo.com'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for HTTP error failure', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('Server Error', { status: 500 });

  try {
    const research = await performLiveWebResearch('Search HTTP Fail');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.error, 'Search HTTP error 500');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('performLiveWebResearch - deterministic mock test for network rejection', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Network Connection Refused');
  };

  try {
    const research = await performLiveWebResearch('Network Failure');
    assert.strictEqual(research.isFallbackLinkOnly, true);
    assert.strictEqual(research.error, 'Network Connection Refused');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeAgentTask - executes live web search when research prompt is detected', async () => {
  const originalFetch = globalThis.fetch;
  const mockHtml = `
    <html><body>
      <a class="result__url" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fdevelopers.cloudflare.com%2Fpages%2F">Cloudflare Pages</a>
      <a class="result__snippet">Deploy full-stack applications with Cloudflare Pages Functions.</a>
    </body></html>
  `;
  globalThis.fetch = async () => new Response(mockHtml, { status: 200 });

  try {
    const result = await executeAgentTask(' Search Cloudflare Pages docs', true);
    assert.strictEqual(result.state, 'completed');
    assert.ok(result.structuredAnswer);
    assert.ok(result.searchResults);
    assert.strictEqual(result.searchResults?.isFallbackLinkOnly, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('executeAgentTask - YouTube command distinguishes search opening vs in-app playback', async () => {
  const result = await executeAgentTask('Play a song on YouTube', true);
  assert.strictEqual(result.state, 'completed');
  assert.strictEqual(result.requiresInternet, true);
  assert.strictEqual(result.outputData?.action, 'open_youtube_search');
  assert.ok(result.summary.includes('YouTube অনুসন্ধান লিঙ্ক'));
});

test('executeAgentTask - queues YouTube command when offline', async () => {
  const result = await executeAgentTask('Play a song on YouTube', false);
  assert.strictEqual(result.state, 'offline_queued');
  assert.strictEqual(result.requiresInternet, true);
});

test('executeAgentTask - Gmail task returns not_connected when OAuth token is missing', async () => {
  const result = await executeAgentTask('Send an email via Gmail', true, false, undefined);
  assert.strictEqual(result.state, 'not_connected');
  assert.strictEqual(result.requiresInternet, true);
  assert.ok(result.summary.includes('Gmail API সংযুক্ত নয়'));
});

test('executeAgentTask - Gmail task asks for permission when OAuth token is present', async () => {
  const result = await executeAgentTask('Send an email via Gmail', true, false, 'mock-oauth-token');
  assert.strictEqual(result.state, 'permission_pending');
  assert.strictEqual(result.requiresConfirmation, true);
  assert.ok(result.confirmationMessage?.includes('ইমেইল বার্তাটি পাঠাতে চান'));
});

test('executeAgentTask - completes reminder task offline with local persistence note', async () => {
  const result = await executeAgentTask('একটাই রিমাইন্ডার সেট করো', false);
  assert.strictEqual(result.state, 'completed');
  assert.strictEqual(result.requiresInternet, false);
  assert.strictEqual(result.outputData?.offlineStored, true);
  assert.ok(result.outputData?.noteId);
});

test('generateDevelopmentPlan - parses Web Development request', () => {
  const plan = generateDevelopmentPlan('Build a website for my Telegram channel.');
  assert.strictEqual(plan.category, 'web');
  assert.strictEqual(plan.title, 'Telegram চ্যানল ও ওয়েব ল্যান্ডিং পেজ ওয়েবসাইট');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/server/templates/landing-page.html'));
});

test('generateDevelopmentPlan - parses Android App & APK Builder request', () => {
  const plan = generateDevelopmentPlan('Create an Android app and prepare an APK.');
  assert.strictEqual(plan.category, 'android');
  assert.strictEqual(plan.title, 'Android অ্যাপ ও APK/AAB বিল্ড কনফিগারেশন');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/app.json'));
});

test('generateDevelopmentPlan - parses Auto QA request', () => {
  const plan = generateDevelopmentPlan('Inspect this project, find bugs, and fix them.');
  assert.strictEqual(plan.category, 'qa');
  assert.strictEqual(plan.title, 'Auto QA & টেস্ট সুইট অটোমেশন');
});

test('getProjectBrainSummary - returns non-secret project knowledge', () => {
  const brain = getProjectBrainSummary();
  assert.strictEqual(brain.name, 'Voice-Memory-Assistant-net (Badboy AI)');
  assert.ok(brain.frameworks.includes('TypeScript'));
  assert.ok(brain.apiEndpoints.includes('/api/assistant/chat'));
});

test('runAutoQASuite - reports QA suite status accurately', () => {
  const qa = runAutoQASuite();
  assert.strictEqual(qa.typecheckPassed, true);
  assert.strictEqual(qa.unitTestsPassed, true);
  assert.strictEqual(qa.buildPassed, true);
  assert.ok(qa.details.length >= 4);
});

test('getPluginRegistryStatus - lists active and not_connected tool adapters', () => {
  const plugins = getPluginRegistryStatus();
  assert.ok(plugins.some((p) => p.id === 'github-adapter'));
  assert.ok(plugins.some((p) => p.id === 'web-research-adapter'));
  const gmailPlugin = plugins.find((p) => p.id === 'gmail-adapter');
  assert.strictEqual(gmailPlugin?.status, 'not_connected');
});

test('DEFAULT_REPO_CONFIG has target repository details', () => {
  assert.strictEqual(DEFAULT_REPO_CONFIG.owner, 'shomratofficial007-spec');
  assert.strictEqual(DEFAULT_REPO_CONFIG.repo, 'Voice-Memory-Assistant-net');
  assert.strictEqual(DEFAULT_REPO_CONFIG.baseBranch, 'main');
});

test('createGitHubPullRequest - handles missing token gracefully', async () => {
  const plan = generateDevelopmentPlan('Add reminder');
  const result = await createGitHubPullRequest({
    githubToken: '',
    plan,
    changes: [{ path: 'test.txt', content: 'hello' }],
  });
  assert.strictEqual(result.success, false);
  assert.ok(result.error?.includes('Personal Access Token'));
});
