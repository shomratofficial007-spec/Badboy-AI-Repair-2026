import assert from 'node:assert';
import test from 'node:test';
import {
  generateDevelopmentPlan,
  DEFAULT_REPO_CONFIG,
  createGitHubPullRequest,
} from './developer.ts';

test('generateDevelopmentPlan - parses reminder request in Bengali', () => {
  const plan = generateDevelopmentPlan('Badboy, add a new reminder feature to yourself.');
  assert.strictEqual(plan.title, 'স্মারক ও রিমাইন্ডার সিস্টেম');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/lib/assistant/types.ts'));
  assert.ok(plan.filesToModify.includes('artifacts/mobile/app/(tabs)/index.tsx'));
  assert.strictEqual(plan.requiresApproval, true);
  assert.strictEqual(plan.tasks.length, 4);
});

test('generateDevelopmentPlan - parses voice feature request in Bengali', () => {
  const plan = generateDevelopmentPlan('ব্যাডবয়, ভয়েস কমান্ড যোগ করো');
  assert.strictEqual(plan.title, 'ভয়েস ইন্টারেকশন ও ওয়েক-ওয়ার্ড উন্নয়ন');
  assert.ok(plan.filesToModify.includes('artifacts/mobile/lib/assistant/voice.ts'));
});

test('generateDevelopmentPlan - fallback for generic feature request', () => {
  const plan = generateDevelopmentPlan('Create a custom analytics plugin');
  assert.strictEqual(plan.title, 'নতুন ফিচারের উন্নয়ন পরিকল্পনা');
  assert.ok(plan.branchName.startsWith('feature/badboy-custom-feature-'));
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
