# SPEC — ChatGPT Subscription OAuth Direct Routing

## Overview
Implement an **experimental, default-disabled** ChatGPT subscription OAuth feature that allows the local CLI to route eligible OpenAI-model **streaming** requests directly to OpenAI instead of Codebuff backend routing, mirroring the prior Claude OAuth architecture pattern.

## Protocol Assumptions (Explicit)
Because this is unofficial/experimental, this implementation proceeds under the following explicit assumptions:

1. OAuth authorize endpoint: `https://auth.openai.com/oauth/authorize`
2. OAuth token endpoint: `https://auth.openai.com/oauth/token`
3. Public client id is configurable constant, defaulting to Codex-compatible value from ecosystem references.
4. PKCE (`S256`) is required.
5. Redirect URI is pinned to: `http://localhost:1455/auth/callback`
6. User can paste either:
   - raw authorization code, or
   - full callback URL containing code/state query params.
7. Token response includes at least `access_token`, optional `refresh_token`, and expiry info (`expires_in` or equivalent).
8. Refresh uses standard `grant_type=refresh_token`.

If any assumption fails at runtime, the feature fails with explicit guidance and remains safely fallbackable only where policy allows.

## Requirements
1. Add ChatGPT OAuth feature set, default disabled behind `CHATGPT_OAUTH_ENABLED = false`.
2. Add a new CLI command and mode: `/connect:chatgpt` with dedicated banner flow.
3. Implement browser-based PKCE code-paste flow (no device-code flow in this iteration).
4. Keep user-facing warning minimal (per user preference), while leaving code comments clearly marking experimental nature.
5. Store ChatGPT OAuth credentials in local credentials JSON alongside existing credentials.
6. Support env-var token override (power-user/automation use), but env var **must not bypass feature flag**.
7. Add refresh-token support with concurrency guard (mutex) for persisted credentials.
8. Direct routing scope is **streaming only** (`promptAiSdkStream` path); non-streaming and structured stay backend-routed.
9. Add model allowlist for direct routing; include optimistic aliases:
   - `openai/gpt-5.3`
   - `openai/gpt-5.3-codex`
   - `openai/gpt-5.2`
   - `openai/gpt-5.2-codex`
   - plus selected nearby GPT/Codex IDs already present in repo config.
10. Provide deterministic model normalization for direct requests (OpenRouter-style -> provider-native):
   - Example: `openai/gpt-5.3-codex` -> `gpt-5.3-codex`
   - Mapping table lives in constants and is used for prevalidation.
11. Unsupported model handling must be deterministic and prevalidated:
   - if model is not in allowlist/mapping for direct route, fail with explicit unsupported-model error (no fallback).
12. Fallback policy:
   - Rate-limit/overload classification: auto-fallback to Codebuff backend.
   - Auth errors (401/403): fail explicitly with reconnect guidance (no fallback).
   - All other direct errors: fail fast (no fallback), per user decision.
13. Successful direct ChatGPT OAuth requests do **not** consume Codebuff credits.
14. Add lightweight ChatGPT connection status surfacing in CLI (usage banner and/or bottom status line), without quota API dependency.
15. Preserve existing Claude OAuth behavior unchanged.
16. Add temporary OAuth validation script that tests auth URL generation + token exchange manually before/alongside full wiring.
17. Add/update tests for credential parsing/storage/refresh, model gating, routing/fallback classification, and CLI command/mode wiring.
18. Never log OAuth tokens in analytics or error logs.

## Direct Request Transformation Rules
Before sending direct streaming requests to OpenAI, enforce strict sanitization:

1. Rewrite `model` from `openai/*` format to provider-native mapped id.
2. Remove provider-specific/non-OpenAI fields (e.g., codebuff metadata/provider routing payloads).
3. Preserve fields known to be valid for OpenAI-compatible chat completions.
4. Do not inject Codex-specific required prefix by default in v1 (user preference), but structure code so optional future injection is easy.

## Error Classification Table
| Class | Detection | Behavior |
|---|---|---|
| Rate limit | HTTP 429 or message/body contains rate-limit indicators | Fallback to backend (if no output emitted yet) |
| Auth | HTTP 401/403 or auth-token-invalid indicators | Fail with reconnect guidance; no fallback |
| Unsupported model | Local allowlist/mapping precheck failure | Fail explicit unsupported-model error; no fallback |
| Other | Network timeout, 5xx, malformed payload, unknown 4xx | Fail fast; no fallback |

## Routing Scope
1. Direct routing applies only to `promptAiSdkStream` eligible requests.
2. `promptAiSdk` and `promptAiSdkStructured` remain backend-only for this iteration.
3. Backend routing remains unchanged for all non-eligible models and when feature disabled/disconnected.

## Credentials & Precedence Rules
1. Credentials file schema extends with `chatgptOAuth` object.
2. Precedence: env token override > persisted OAuth credentials > none.
3. Env token produces synthetic non-refreshing credentials object.
4. Persisted credentials refresh when expired/near-expiry (5-minute buffer).
5. On refresh failure for persisted credentials, clear only `chatgptOAuth` entry (preserve other credentials).

## Feature Gating Matrix
1. `CHATGPT_OAUTH_ENABLED = false`
   - hide `/connect:chatgpt` command and banner UX
   - disable direct routing even if env token exists
2. `CHATGPT_OAUTH_ENABLED = true` and credentials available
   - enable command/UI
   - enable direct routing for eligible models

## Logging/Redaction Requirements
1. Never log raw access tokens, refresh tokens, authorization headers, or token response payloads.
2. If callback URL is logged for debugging, redact query values for `code`, `access_token`, `refresh_token`, and similar sensitive keys.
3. Analytics properties must not include token-bearing strings.

## Technical Approach
1. Create `common/src/constants/chatgpt-oauth.ts`:
   - feature flag, endpoints, client id, redirect URI, env var name, model allowlist/mapping helpers.
2. Export new constants via `common/src/constants/index.ts` so legacy `old-constants` re-export path includes them.
3. Extend `sdk/src/env.ts` with ChatGPT OAuth env-token helper.
4. Extend `sdk/src/credentials.ts` with ChatGPT OAuth schema+helpers mirroring Claude pattern.
5. Create `cli/src/utils/chatgpt-oauth.ts` for PKCE start/open/exchange/disconnect/status.
6. Create `cli/src/components/chatgpt-connect-banner.tsx` and auth-code handler.
7. Wire CLI command/input mode/slash menu/router/banner registry for `connect:chatgpt`.
8. Extend model provider (`sdk/src/impl/model-provider.ts`):
   - add ChatGPT direct route decision path for `openai/*` allowlisted models
   - add rate-limit cache helpers for ChatGPT path
   - build direct OpenAI-compatible language model with OAuth bearer auth
   - enforce strict body sanitization + model normalization in the direct path.
9. Extend stream error handling (`sdk/src/impl/llm.ts`) for ChatGPT direct path with required fallback/fail rules and analytics.
10. Extend app init (`cli/src/init/init-app.ts`) for background ChatGPT credential refresh when enabled.
11. Add analytics events for ChatGPT OAuth request/rate-limit/auth-error.
12. Update usage/status UI text to include ChatGPT connection state.
13. Add temporary validation script (e.g., `scripts/chatgpt-oauth-validate.ts`) to exercise OAuth setup interactively.

## Acceptance Criteria
1. With feature disabled, `/connect:chatgpt` is unavailable and no direct routing occurs.
2. With feature enabled, user can run `/connect:chatgpt`, complete browser flow, paste code/URL, and connect.
3. Eligible streaming requests on allowlisted `openai/*` models use direct OAuth path.
4. Direct request payloads are sanitized and model ids normalized before transmission.
5. Rate-limited direct requests fallback to backend automatically.
6. Auth failures produce reconnect guidance and do not fallback.
7. Unsupported models fail immediately with explicit unsupported-model message.
8. Successful direct requests skip Codebuff credit accounting path.
9. Existing Claude OAuth flow remains behaviorally unchanged.
10. New/updated tests pass for touched behavior.
11. Temporary validation script can run and guide manual OAuth exchange checks.

## Files to Create/Modify
- Create: `common/src/constants/chatgpt-oauth.ts`
- Create: `cli/src/utils/chatgpt-oauth.ts`
- Create: `cli/src/components/chatgpt-connect-banner.tsx`
- Create: `scripts/chatgpt-oauth-validate.ts` (temporary validation utility)
- Modify: `common/src/constants/index.ts`
- Modify: `common/src/constants/analytics-events.ts`
- Modify: `sdk/src/env.ts`
- Modify: `sdk/src/credentials.ts`
- Modify: `sdk/src/impl/model-provider.ts`
- Modify: `sdk/src/impl/llm.ts`
- Modify: `sdk/src/index.ts`
- Modify: `cli/src/utils/input-modes.ts`
- Modify: `cli/src/components/input-mode-banner.tsx`
- Modify: `cli/src/data/slash-commands.ts`
- Modify: `cli/src/commands/command-registry.ts`
- Modify: `cli/src/commands/router.ts`
- Modify: `cli/src/chat.tsx`
- Modify: `cli/src/components/usage-banner.tsx`
- Modify: `cli/src/components/bottom-status-line.tsx`
- Modify: `cli/src/init/init-app.ts`
- Modify tests in SDK/CLI for new behavior.

## Out of Scope
1. Device-code auth flow.
2. Legal/policy guarantees around undocumented endpoints.
3. Full quota/usage API integration for ChatGPT subscription plans.
4. Local callback server daemon beyond paste-based flow.
5. Enabling feature by default.
