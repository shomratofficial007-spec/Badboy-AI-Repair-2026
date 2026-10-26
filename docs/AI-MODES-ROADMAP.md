# AI Modes and Safe Automation Roadmap

> Proposal for review. This document does not claim that these modes are implemented yet. Existing app features must be preserved while changes are added incrementally.

## Goals

Add three clearly separated operating modes to Voice-Memory-Assistant:

1. **Online Mode** — use the configured remote AI/API and permitted connected services.
2. **Offline Mode** — use only capabilities actually available on the device, including local data and an optional on-device model. If a local model is not installed or supported, explain that limitation instead of silently claiming offline AI is available.
3. **Background Task Mode** — run tasks that the user explicitly approved, record their status/results, and notify the user when the platform permits.

## Safety and permission rules

- Never expose API keys or server secrets in the Android app bundle, logs, or client responses.
- Keep private memory on-device by default. Do not upload memory unless the user explicitly enables and approves that behavior.
- Ask for confirmation before consequential actions, external messages, destructive operations, or changes to project files.
- Background execution must respect Android battery restrictions, foreground-service rules, notification permission, and app lifecycle behavior. Do not promise continuous microphone listening while the app is closed or the phone is locked unless a supported, permission-compliant implementation is verified.
- Tasks that change code must use a separate branch and pull request. Never merge to `main` automatically.
- Never label a task successful unless its required checks actually ran and passed. Show queued, skipped, unavailable, and failed checks distinctly.
- Keep the existing app's working features and configuration; changes should be additive and backward-compatible wherever practical.

## Required validation gates

A PR that changes deployment or app behavior must identify which checks apply and record their results:

### Gate 1 — Repository and code
- Install dependencies using the repository's lockfile.
- Run available unit tests, lint, type checks, and mobile build checks.
- Inspect the diff for accidental feature removal, secrets, and unrelated changes.

### Gate 2 — Cloudflare deployment
- Validate Wrangler configuration and run a deployment dry-run.
- Where deployment credentials and a target environment are configured, deploy only to the intended non-production/test environment first.
- Confirm the deployed endpoint responds with the expected status and content. A dry-run alone is not proof of a live deployment.

### Gate 3 — API connectivity
- Test the real HTTPS endpoint from an external request and, where possible, from the Android app.
- Verify expected success and error responses, timeout handling, and safe handling of missing/invalid configuration.
- Do not mark this gate passed if no live endpoint is available; report it as blocked/not tested.

### Gate 4 — Android APK
- Build the APK in a separate, explicitly enabled workflow.
- Confirm the artifact exists and can be downloaded; install and test on a real Android device before claiming device-level success.
- Test app launch, chat/API request, permission prompts, voice behavior where supported, app background/resume, and error handling.
- A successful web build or Cloudflare deployment does not prove APK functionality.

## Background task lifecycle

Every approved task should have a stable ID and visible state:

`pending → running → succeeded | failed | blocked | cancelled`

Store only the minimum task metadata/results required. Provide a way to review and cancel queued work where supported. Use server-side automation (for example, CI workflows) for repository checks so the phone does not need to remain awake; do not rely on this chat session itself as a persistent worker.

## Incremental delivery plan

1. Establish baseline checks and document the current capabilities.
2. Add a UI mode selector and a shared capability/status model without removing the existing chat flow.
3. Connect Online Mode to the existing configured API and show connection/error states.
4. Add Offline Mode only after verifying a supported on-device model and local storage path.
5. Add Background Task Mode with explicit approval, status tracking, cancellation where possible, and notifications subject to Android/platform limits.
6. Add separate CI checks for code, Cloudflare/API, and APK. Keep APK builds disabled unless explicitly requested.

## Acceptance criteria for this proposal

- This PR changes documentation only and does not change runtime behavior.
- No existing app feature is removed.
- Each future implementation PR is small, reviewable, and independently testable.
- Live deployment, API, and real-device APK results are reported separately.
- The repository owner reviews and merges each PR manually.
