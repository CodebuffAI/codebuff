# Shard S7 — SDK client, run, providers, failover

**Scope audited:** `sdk/src/client.ts`, `sdk/src/run.ts`, `sdk/src/run-state.ts`, `sdk/src/provider-config.ts`, `sdk/src/model-discovery.ts`, `sdk/src/credentials.ts`, `sdk/src/retry-config.ts`, `sdk/src/custom-tool.ts`, `sdk/src/validate-agents.ts`, `sdk/src/impl/llm.ts`, `sdk/src/impl/failover.ts`, `sdk/src/impl/model-provider.ts`, `sdk/src/impl/agent-runtime.ts`, `sdk/src/impl/chatgpt-backend-fetch.ts`, `sdk/src/error-utils.ts`, and relevant SDK tests under `sdk/src/__tests__` / `sdk/src/impl/__tests__`.

**Audit domains evaluated:**
1. Security — API-key exfiltration, provider auth boundaries, secret leakage, SSRF-like discovery surfaces.
2. Correctness — provider routing, failover ordering/dedup, retry classification, cost accounting, output schema behavior.
3. State mutation — cancellation lifecycle, shared runtime/cache state, session-state cloning/mutation paths.
4. Error handling — retry/backoff, abort propagation, timeouts, swallowed/shape-losing errors.
5. Performance — redundant provider calls, hanging I/O, unbounded waits, avoidable duplicate failover attempts.
6. Dependency hygiene — AI SDK/provider adapter coupling and runtime dependency surface; no standalone dependency-version finding found in this shard.
7. Test coverage gaps — failover/retry/cost/cancellation/schema tests were checked for critical missing failure modes.
8. API/ABI contract breaks — SDK public client/options/custom tool contracts, config schema behavior, event/output contracts.

## [HIGH] Security — sdk/src/model-discovery.ts:122 — Custom discovery endpoint can receive a configured provider API key cross-origin
- **Risk:** A provider can declare `apiKeyEnv` and an arbitrary `discovery.endpoint`; model discovery then sends `Authorization: Bearer ${env[apiKeyEnv]}` to that endpoint even when it is not on the provider `baseURL` origin. A malicious or compromised repo-local provider config can therefore exfiltrate a user's OpenAI/OpenRouter/custom provider key when the user runs provider model discovery.
- **Fix:** Treat discovery endpoints as part of the provider trust boundary: by default require `discovery.endpoint` to share origin with `provider.baseURL`, or only attach `Authorization` when origins match. If cross-origin discovery is needed, require an explicit opt-in flag and prominent warning, and prefer endpoint-specific auth config over reusing the provider inference key.
- **Evidence:** `providerDiscoverySchema` accepts any URL for `endpoint` (`sdk/src/provider-config.ts:108-114`); `normalizeEndpoint` returns `discovery.endpoint` verbatim (`sdk/src/model-discovery.ts:118-123`); `authorizationHeaders` reads the provider env var and returns a bearer token (`sdk/src/model-discovery.ts:137-148`); `discoverProviderModels` sends those headers to the chosen endpoint (`sdk/src/model-discovery.ts:280-285`).

```ts
// sdk/src/model-discovery.ts
if (discovery.endpoint) return discovery.endpoint
...
return { Authorization: `Bearer ${apiKey}` }
...
const response = await params.fetch(endpoint, {
  headers: {
    Accept: 'application/json',
    ...authorizationHeaders(provider, env),
  },
})
```

## [HIGH] State mutation / error handling — sdk/src/impl/llm.ts:735 — Run cancellation is not propagated into provider LLM requests or retry sleeps
- **Risk:** The SDK checks `params.signal.aborted` before starting prompts and after caught errors, but the provider calls themselves are not given the user's `AbortSignal`, and retry backoff uses a plain `setTimeout`. A user-cancelled run can therefore leave the underlying streaming/generation HTTP request alive until the provider finishes, and can remain stuck in a retry delay before noticing cancellation. This wastes tokens/cost, delays UI cancellation, and can leak background work after the SDK has returned a cancelled state.
- **Fix:** Pass the caller signal into all AI SDK calls using the supported request option (for example `abortSignal: params.signal`) for `streamText`, `generateText`, and `generateObject`. Replace `await new Promise(resolve => setTimeout(resolve, delayMs))` with an abort-aware sleep that rejects/returns immediately on `params.signal.abort` and always removes listeners.
- **Evidence:** Pre-flight checks exist (`sdk/src/impl/llm.ts:640-648`, `1278-1286`, `1391-1399`), but the actual provider calls omit any abort field (`streamText` at `sdk/src/impl/llm.ts:735-755`, `generateText` at `sdk/src/impl/llm.ts:1319-1336`, `generateObject` at `sdk/src/impl/llm.ts:1430-1450`). The retry sleep is an uninterruptible timeout (`sdk/src/impl/llm.ts:1220-1228`). A grep for `abortSignal` in `sdk/src` returned no matches.

```ts
// sdk/src/impl/llm.ts
response = streamText({
  ...streamParams,
  model: aiSDKModel,
  messages: convertCbToModelMessages(...),
  ...(hasProviderOptions(requestProviderOptions)
    ? { providerOptions: requestProviderOptions }
    : {}),
})
...
await new Promise((resolve) => setTimeout(resolve, delayMs))
```

## [MEDIUM] Correctness — sdk/src/impl/llm.ts:1134 — BYOK cost accounting still reads `providerMetadata.codebuff` after request metadata moved to `openbuff`
- **Risk:** Provider metadata is now emitted under the `openbuff` key, but cost accounting in streaming, text, and structured paths only reads `providerMetadata.codebuff.usage`. If a provider/adapter returns OpenRouter-style cost metadata under the new `openbuff` namespace, the SDK ignores it and either falls back to approximate token × pricing accounting or records no cost when no pricing capability is configured. This can under/over-report BYOK/local spend and makes cost telemetry dependent on stale naming.
- **Fix:** Centralize provider usage extraction and accept both `providerMetadata.openbuff?.usage` and `providerMetadata.codebuff?.usage` during the migration. Add tests that inject provider metadata under both keys for streaming, `promptAiSdk`, and `promptAiSdkStructured`, including the zero-cost case.
- **Evidence:** `getProviderOptions` writes `openbuff` metadata and explicitly calls it the replacement for `codebuff` (`sdk/src/impl/llm.ts:210-218`). The three accounting paths check only `providerMetadata.codebuff` (`sdk/src/impl/llm.ts:1134-1143`, `1350-1360`, `1465-1475`). Existing `llm-cost.test.ts` covers only the fallback helper `computeCostCentsFromUsage`, not provider metadata namespace extraction.

```ts
// sdk/src/impl/llm.ts
return {
  ...providerOptions,
  // Use openbuff key for provider metadata (formerly "codebuff").
  openbuff: { ... }
}

let costOverrideDollars: number | undefined
if (providerMetadata.codebuff) {
  if (providerMetadata.codebuff.usage) {
    const openrouterUsage = providerMetadata.codebuff.usage as OpenRouterUsageAccounting
    costOverrideDollars =
      (openrouterUsage.cost ?? 0) +
      (openrouterUsage.costDetails?.upstreamInferenceCost ?? 0)
  }
}
```

## [MEDIUM] Error handling / performance — sdk/src/model-discovery.ts:280 — Model discovery fetches have no timeout or cancellation path
- **Risk:** `discoverProviderModels` awaits the caller-provided `fetch` with only headers. A slow or never-responding discovery endpoint can hang the provider picker/setup flow indefinitely, and there is no way for callers to cancel discovery even though normal runs expose `AbortSignal` plumbing. This is especially risky because discovery can target arbitrary configured endpoints and may be triggered interactively.
- **Fix:** Add `signal?: AbortSignal` and `timeoutMs?: number` to the discovery API, compose them with an internal `AbortController`, pass `signal` to `fetch`, and return a clear timeout/cancelled error. Tests should include a never-settling fetch and an already-aborted signal.
- **Evidence:** Endpoint normalization and auth are done synchronously, then `params.fetch(endpoint, { headers: ... })` is awaited without `signal` or timeout (`sdk/src/model-discovery.ts:280-285`). The public discovery tests cover successful fetches, HTTP errors, and missing API keys, but not hanging/aborted discovery.

```ts
const response = await params.fetch(endpoint, {
  headers: {
    Accept: 'application/json',
    ...authorizationHeaders(provider, env),
  },
})
```

## [LOW] API/ABI contract breaks — sdk/src/custom-tool.ts:16 — Custom SDK tools cannot observe run cancellation
- **Risk:** `CustomToolDefinition.execute` receives only parsed tool parameters, so a long-running SDK custom tool cannot check the run's `AbortSignal`, cannot distinguish normal failure from user cancellation, and cannot cleanly cancel its own child processes/network calls. This conflicts with the SDK's public `run({ signal })` contract and makes cancellation best-effort only for built-in runtime paths.
- **Fix:** Introduce an execution context argument such as `execute(params, ctx: { signal: AbortSignal; logger?: Logger; runId?: string })`, keep the old one-argument form as backward compatible, and document that custom tools should pass `ctx.signal` into their I/O.
- **Evidence:** The public type exposes `execute: (params: Args) => Promise<ToolResultOutput[]>` (`sdk/src/custom-tool.ts:16`), and `getCustomToolDefinition` wraps the same one-argument function (`sdk/src/custom-tool.ts:55-68`). No cancellation context is available to SDK custom tool authors.

```ts
export type CustomToolDefinition<...> = {
  ...
  execute: (params: Args) => Promise<ToolResultOutput[]>
}
```

## [LOW] Test coverage gaps — sdk/src/__tests__/run-cancellation.test.ts — Cancellation tests do not assert provider-request abort or abortable retry sleep
- **Risk:** The current cancellation suite exercises session-state preservation and user-visible cancelled output, but it does not catch the lower-level provider leak described above: whether the LLM fetch receives an abort signal, whether an in-flight provider request is actually aborted, and whether a run exits immediately while sleeping between retry attempts.
- **Fix:** Add unit tests around `promptAiSdkStream`/`promptAiSdk` using a fake model/fetch that records `init.signal`, aborts mid-request, and asserts the request is cancelled. Add a retry test with fake timers that aborts during `computeBackoffDelayMs` sleep and verifies no full delay elapses.
- **Evidence:** `sdk/src/__tests__/run-cancellation.test.ts` repeatedly uses `AbortController` and asserts run-state behavior, while the SDK LLM implementation contains no `abortSignal` pass-through and an unconditional `setTimeout` backoff (`sdk/src/impl/llm.ts:735-755`, `1220-1228`, `1319-1336`, `1430-1450`).

## Positive checks / non-findings

- **Failover dedup:** `resolveModelsToTry` dedupes the primary and duplicate backup models while preserving first-seen order (`sdk/src/impl/failover.ts:46-63`), and tests cover repeated primary and duplicate backups (`sdk/src/impl/__tests__/failover.test.ts:74-118`, `sdk/src/impl/__tests__/failover-integration.test.ts:57-64`). No S7 finding.
- **Retry + jitter:** `computeBackoffDelayMs` implements capped exponential backoff with ±20% jitter (`sdk/src/retry-config.ts:64-86`) and the stream retry loop uses it (`sdk/src/impl/llm.ts:1191-1228`). The remaining issue is abortability, reported above.
- **API key fallback:** Configured providers resolve keys strictly from their declared `apiKeyEnv` and throw on missing env vars (`sdk/src/provider-config.ts:1456-1465`); Anthropic-compatible local gateways pass `apiKey: apiKey ?? ''` to avoid the AI SDK falling back to ambient `ANTHROPIC_API_KEY` (`sdk/src/impl/model-provider.ts:554-566`). No fallback-to-hosted-backend finding found.
- **Output schema validation:** Static validation requires `outputSchema` to be paired with `outputMode: 'structured_output'` (`common/src/types/dynamic-agent-template.ts:229-240`), validated agents convert JSON Schema to Zod (`common/src/templates/agent-validation.ts:227-245`), `set_output` validates against the runtime Zod schema (`packages/agent-runtime/src/tools/handlers/tool/set-output.ts:45-75`), and `run.ts` validates server prompt responses against `AgentOutputSchema` (`sdk/src/run.ts:1038-1055`). No S7 output-schema enforcement finding found.
