# LESSONS — ChatGPT OAuth Direct Routing

Session: `.agents/sessions/03-02-14:07-chatgpt-oauth-direct/`

## What went well
- Building this feature behind a strict feature flag (`CHATGPT_OAUTH_ENABLED=false`) reduced rollout risk while allowing full end-to-end wiring.
- Reusing the Claude OAuth architectural pattern (credentials helpers, refresh mutex, routing split) accelerated implementation without coupling the two providers.
- Splitting policy logic into `classifyChatGptOAuthStreamError` made fallback/auth/fail-fast behavior easier to test and reason about.
- Adding focused CLI tests for `/connect:chatgpt` gating and utility sanitization caught regression risk early.

## Current confidence / known gaps
- Runtime ChatGPT stream policy is **partially tested**: `classifyChatGptOAuthStreamError` is covered, but we do not yet have full behavioral tests for `promptAiSdkStream` recursion branches (actual fallback recursion and post-partial-output behavior).
- CLI routing coverage is strongest for **feature-flag OFF** paths; flag-ON auth-code routing should get explicit dedicated tests in a future pass.

## What was tricky
- The repo had unrelated local drift during implementation; explicit scope cleanup (`git checkout -- <unrelated files>`) was necessary to avoid accidental cross-feature commits.
- CLI module mocking is path-sensitive. Test modules under `cli/src/commands/__tests__` must mock sibling modules with correct relative paths (e.g. `../../state/chat-store`), or mocks silently fail.
- Over-mocking analytics can break transitive imports (`setAnalyticsErrorLogger` export expectations). A safe pattern is spreading real analytics exports and overriding only `trackEvent`.

## Unexpected behaviors / gotchas
- A staged unrelated file can survive despite working-tree revert; both staged and worktree states must be checked before final handoff.
- “Looks correct” tests can still miss runtime branches if they only validate helper classification, not route wiring; reviewer loops were useful to force coverage on practical paths.
- For OAuth tooling/scripts, sanitize error text aggressively. Returning status-only errors avoids accidental token payload leakage.

## Useful patterns discovered
- Keep direct-provider routing stream-only initially; explicitly forcing non-streaming/structured calls to backend avoided broad compatibility risk.
- Use deterministic model allowlist + normalization mapping in constants to avoid relying on provider-side parsing/errors for unsupported models.
- Treat temporary protocol validation scripts as first-class validation artifacts: they are valuable for real-account smoke checks without coupling to full CLI runtime.

## Temporary script disposition
- `scripts/chatgpt-oauth-validate.ts` is currently kept as a **dev utility** for manual protocol revalidation while the feature remains experimental/off by default.
- Removal criteria: if protocol endpoints are either officially documented or the CLI flow gets stable automated integration coverage, this script can be retired.

## Repeatable security verification
- For redaction checks, run targeted searches against changed code/log handling paths for sensitive markers before handoff, e.g. `access_token`, `refresh_token`, and `Authorization: Bearer`.
- Keep surfaced token exchange errors status-only and avoid echoing raw provider response bodies.

## Follow-up improvements worth considering
- Add deeper runtime-behavior tests for `promptAiSdkStream` recursive fallback branches (not just policy classifier).
- Add explicit CLI test for flag-ON connect flow path once flag toggling is test-harness friendly.
- If feature graduates from experimental, add richer direct-path observability while preserving strict token redaction.
- Add periodic protocol drift checks (authorize/token/callback PKCE assumptions) before enabling the feature flag in production defaults.
