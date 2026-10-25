import assert from 'node:assert';
import test from 'node:test';
import {
  generateDevelopmentPlan,
  getProjectBrainSummary,
  runAutoQASuite,
  getPluginRegistryStatus,
  executeAgentTask,
  DEFAULT_REPO_CONFIG,
  createGitHubPullRequest,
} from './developer.ts';

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
  assert.ok(plugins.some((p) => p.id === 'cloudflare-adapter'));
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
