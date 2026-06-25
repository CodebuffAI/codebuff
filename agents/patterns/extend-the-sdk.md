# Pattern: Extend the SDK

## When to use
You need to add a new model provider, modify the provider config layer, or
extend the SDK's model discovery / request flow.

## Steps

1. **Provider config** — `sdk/src/provider-config.ts` is the source of truth
   for how providers and models are resolved. Extend the config types and
   `resolveConfiguredProviderModel` / `resolveModelCapabilities` as needed.

2. **Model provider impl** — `sdk/src/impl/model-provider.ts` handles the
   actual LLM request dispatch. Add provider-specific compatibility shims
   in `applyConfiguredProviderRequestCompatibility`.

3. **Model discovery** — if the provider supports model listing, extend
   `sdk/src/model-discovery.ts` (`discoverProviderModels`,
   `getAvailableProviderModels`).

4. **OpenAI-compatible layer** — for OpenAI-compatible providers, the shared
   implementation lives in `packages/internal/src/openai-compatible/`. Add
   a new language model class only if the provider is not OpenAI-compatible.

5. **CLI wiring** — `cli/src/utils/openbuff-provider.ts` owns the provider
   setup wizard and config persistence. Update
   `setupOpenbuffProviderFromArgs` / `handleOpenbuffProviderCommand` if the
   provider needs CLI setup flow.

6. **Constants** — register the provider in `common/src/constants/model-config.ts`
   (`models`, `costModes`, `ALLOWED_MODEL_PREFIXES` as applicable).

7. **Tests** — `sdk/src/__tests__/model-provider.test.ts` and
   `sdk/src/impl/__tests__/provider-options-metadata.test.ts`. Add a fixture
   provider config and a fetch mock.

## Validation
```bash
bun --cwd=common run typecheck
bun --cwd=sdk run typecheck
bun --cwd=sdk test
bun test sdk/src/__tests__/model-provider.test.ts
```

## Conventions
- Provider names are lowercase, hyphenated (`openai`, `openrouter`,
  `opencode-zen`).
- Never hardcode API keys — read from env via `common/src/env-schema.ts`.
- BYOK providers must not assume Openbuff-hosted credit/markup; preserve
  provider cost accounting via `calculateProviderCostCents`.
- OAuth rate-limit state (`markChatGptOAuthRateLimited` etc.) is
  provider-specific — extend only if the new provider uses OAuth.

## Risks
- `resolveConfiguredProviderModel` has subtle fallback semantics; a missing
  capability flag can cause the wrong model variant to be selected. Test
  with both explicit and auto-resolved model names.
- The `openbuff.d/providers.json` and `openbuff.d/routes.json` config files
  may need updating if the provider adds a new route — check both.
