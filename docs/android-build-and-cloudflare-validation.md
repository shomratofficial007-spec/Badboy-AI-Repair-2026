# Android and Cloudflare build verification

This project keeps the existing Replit development/build path and adds a portable Expo development entry point. No existing dependency or application feature is removed by this change.

## Local development

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm --filter @workspace/mobile run dev
```

The development script uses Replit's optional login only when a Replit session secret is present. Outside Replit it starts Expo without constructing URLs from missing Replit environment variables. Set `PORT` only when your environment requires a specific port.

## Portable Cloudflare Pages build

From the repository root:

```sh
pnpm --filter @workspace/mobile run build
```

Outside Replit, `artifacts/mobile/scripts/build.js` performs an Expo web export into `artifacts/mobile/dist`, then asks Wrangler to bundle the Pages Functions and copies the resulting worker bundle to `dist/_worker.js`. The CI workflow runs this command and fails on a non-zero exit. A green CI build verifies bundling, not a live Cloudflare deployment or AI provider credentials.

The root Worker deployment is separate:

```sh
pnpm run deploy
```

It uses the root `wrangler.json`. Configure provider credentials such as `OPENROUTER_API_KEY` as a Cloudflare secret; never put secret values in repository files or client-side Expo variables.

## Android output choices

- **Preview profile:** internal distribution and `buildType: apk`; use this when testing/installing directly on an Android device.
- **Production profile:** `buildType: app-bundle`; this produces an Android App Bundle (AAB), intended for store/release workflows rather than direct APK installation.

The GitHub Actions Android workflow builds the preview APK through EAS. It requires the repository Actions secret `EXPO_TOKEN` and the existing Expo project ID configured in the workflow. The workflow now fails early with a clear message if the token is missing. The token value is never printed.

## Checks versus live-device verification

CI covers mobile unit tests, workspace library typechecking, mobile TypeScript checking, and the production web export/function bundle. It does not prove that a generated APK installs, Android microphone permissions behave correctly, or a deployed Worker can reach the AI provider.

After this PR is merged and Cloudflare has deployed the intended commit, verify:

1. `GET /api/healthz` returns JSON and inspect `status`, `aiConfigured`, and `model`.
2. Send a real request to the actual chat endpoint using its implemented request schema; verify a genuine provider response (including a Bangla prompt), HTTP status, and sanitized failure output.
3. Install the EAS preview APK and test API connectivity, text chat, microphone permission, speech input/output, and app lifecycle on the target Android device.

Do not report a live test as passed unless it was actually run. The `@replit/connectors-sdk` dependency is intentionally retained: this change does not remove it without a complete usage and lockfile review.
