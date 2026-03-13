# PLAN — ChatGPT Subscription OAuth Direct Routing

## Implementation Steps
1. **Add shared ChatGPT OAuth constants**
   - Create `common/src/constants/chatgpt-oauth.ts` with:
     - feature flag (`CHATGPT_OAUTH_ENABLED=false`)
     - endpoints/client id/redirect URI/env var
     - model allowlist + normalization helpers
   - Export through `common/src/constants/index.ts`.

2. **Build core OAuth utility + temporary protocol validation script (early gate)**
   - Create `cli/src/utils/chatgpt-oauth.ts` with PKCE URL generation, browser-open helper, pasted code/URL parsing, token exchange helper.
   - Create `scripts/chatgpt-oauth-validate.ts` to test OAuth URL generation + paste parsing + token exchange interaction.
   - **Run this script before full integration** as go/no-go checkpoint for endpoint assumptions.

3. **Add SDK env + credential support**
   - Extend `sdk/src/env.ts` with `getChatGptOAuthTokenFromEnv()`.
   - Extend `sdk/src/credentials.ts` with `chatgptOAuth` schema and helpers:
     - get/save/clear
     - valid-check + refresh mutex
     - get-valid-with-refresh
   - Preserve all non-target credentials in read/write operations.

4. **Add CLI connect flow UI and command routing**
   - Create `cli/src/components/chatgpt-connect-banner.tsx` with state machine + `handleChatGptAuthCode`.
   - Update input modes (`connect:chatgpt`) and banner registry.
   - Add `/connect:chatgpt` command + alias handling and slash command entry (feature-gated).
   - Extend router to process pasted auth code in `connect:chatgpt` mode.
   - Verify command visibility: hidden when flag OFF, present when flag ON.

5. **Implement direct routing primitives in model-provider (decomposed)**
   - 5.1 Add ChatGPT direct eligibility checks (feature flag + creds + model scope + skip flag + rate-limit cache state).
   - 5.2 Add model normalization + prevalidation helpers (OpenRouter-style -> provider-native).
   - 5.3 Add strict payload sanitization helper for direct requests.
   - 5.4 Add ChatGPT OAuth direct model construction using OpenAI-compatible transport.
   - 5.5 Add ChatGPT rate-limit cache helpers (parallel to Claude cache pattern).
   - Keep Claude OAuth path unchanged.

6. **Update stream execution + fallback/error policy**
   - Extend `sdk/src/impl/llm.ts` to:
     - recognize ChatGPT direct route usage
     - emit ChatGPT OAuth analytics
     - fallback only on rate-limit errors
     - fail with reconnect guidance on auth errors
     - fail fast for all other direct errors
     - skip cost accounting for successful ChatGPT direct requests
     - avoid fallback once output has already streamed

7. **Wire startup refresh + CLI status surfacing**
   - Update `cli/src/init/init-app.ts` for background ChatGPT OAuth credential refresh when enabled.
   - Update `cli/src/chat.tsx`, `cli/src/components/bottom-status-line.tsx`, and `cli/src/components/usage-banner.tsx` to surface ChatGPT connection/active status.

8. **Add analytics constants + SDK exports**
   - Extend `common/src/constants/analytics-events.ts` with ChatGPT OAuth request/rate-limit/auth-error events.
   - Ensure SDK exports newly needed helper(s) in `sdk/src/index.ts`.

9. **Add/adjust tests (explicit matrix)**
   - SDK credentials tests:
     - env precedence
     - persisted read/write/clear
     - refresh success/failure + mutex
   - Model-provider tests:
     - rate-limit cache lifecycle
     - allowlist prevalidation + unsupported-model error
     - normalization behavior for mapped/unknown variants
   - LLM routing/fallback tests (targeted):
     - 429 fallback
     - 401/403 no-fallback + reconnect path
     - timeout/5xx fail-fast
     - no fallback after content emitted
   - CLI tests/wiring checks:
     - command/mode visibility by feature flag
     - connect mode routing and handler call.
   - Non-streaming/structured guard check:
     - confirm backend-only behavior unchanged.

10. **Validation and cleanup decision for temporary script**
   - Run targeted tests/typechecks for touched packages.
   - Run OAuth validation script in manual mode (with your account interaction if needed).
   - Decide and apply final disposition of temporary script:
     - keep as dev utility, or
     - remove before finalization.

11. **Security/redaction verification**
   - Validate no token values are logged in direct feature code paths.
   - Grep/check for accidental logging of authorization headers, token payload fields, or raw callback query params.

## Dependencies / Ordering
- Step 1 must be first.
- Step 2 must run before deep integration (early protocol validation gate).
- Step 3 precedes Steps 5–7.
- Step 4 can run in parallel with Step 3 after constants/util setup.
- Step 5 must precede Step 6.
- Step 8 can be implemented alongside Steps 5–6 but must complete before final validation.
- Step 9 follows core implementation completion.
- Steps 10–11 are final validation/cleanup/security passes.

## Risk Areas
1. **Unofficial OAuth contract drift** — endpoint/field incompatibility can break token exchange.
2. **Direct payload compatibility** — strict sanitization must retain required OpenAI fields.
3. **Error classification correctness** — misclassification can violate requested fallback policy.
4. **Model normalization accuracy** — wrong mapping yields avoidable provider failures.
5. **Token redaction** — avoid leakage in logs, errors, or analytics payloads.
6. **Streaming boundary behavior** — fallback must not happen after partial output is emitted.
