import assert from 'node:assert';
import test from 'node:test';
import {
  generateDevelopmentPlan,
  DEFAULT_REPO_CONFIG,
  createGitHubPullRequest,
} from './developer.ts';

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

test('generateDevelopmentPlan - parses Self Development reminder request', () => {
  const plan = generateDevelopmentPlan('Badboy, add a new reminder feature to yourself.');
  assert.strictEqual(plan.category, 'self');
  assert.strictEqual(plan.title, 'স্মারক ও রিমাইন্ডার সিস্টেম');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/lib/assistant/types.ts'));
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
