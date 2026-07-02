# Shard S15 — Docs drift

## Audit Domains Covered

Correctness, state mutation, API/ABI contract, security, error handling, test coverage gaps, dependency hygiene, and performance were evaluated only where documentation drift creates user-facing contract, test, or API risk.

## [MEDIUM] API/ABI contract — docs/configuration.md:93 — Agent template models are documented as ignored but still participate in runtime routing
- **Risk:** Users and agent authors following the docs can omit or mis-route provider entries because the docs say `model:` on agent templates is never read, while the runtime passes it as the last-resort requested model.
- **Fix:** Update the routing docs to state that `openbuff.json` mode/agent/default routes take precedence, but a caller/template-provided model is still used as a last-resort routable model before throwing.
- **Evidence:** `docs/configuration.md:93` says `The \`model:\` field on agent templates is documentation of intent only — it is never read at runtime.`, but `packages/agent-runtime/src/prompt-agent-stream.ts:77` reads `const { model } = template`, `packages/agent-runtime/src/prompt-agent-stream.ts:89` passes `model,`, and `sdk/src/provider-config.ts:1417-1419` returns `if (model) { return { model } }`.

## [MEDIUM] API/ABI contract — docs/architecture.md:187 — Compatibility-alias docs omit the still-supported ChatGPT OAuth token alias
- **Risk:** Operators can remove or fail to set a still-supported Codex/ChatGPT OAuth environment variable because the architecture docs claim `CODEBUFF_API_KEY` is the only retained `CODEBUFF_*` fallback.
- **Fix:** Align the architecture/local-mode compatibility notes with the implemented env contract by listing `CODEBUFF_CHATGPT_OAUTH_TOKEN`/`OPENBUFF_CHATGPT_OAUTH_TOKEN` precedence and any other retained internal-only names, or remove those aliases from code.
- **Evidence:** `docs/architecture.md:187` says `Only \`CODEBUFF_API_KEY\` is accepted as a legacy fallback for \`OPENBUFF_API_KEY\`. Other \`CODEBUFF_*\` env vars ... were removed`, but `common/src/constants/chatgpt-oauth.ts:25` defines `CHATGPT_OAUTH_TOKEN_ENV_VAR = 'CODEBUFF_CHATGPT_OAUTH_TOKEN'`, `common/src/constants/chatgpt-oauth.ts:28` defines `OPENBUFF_CHATGPT_OAUTH_TOKEN_ENV_VAR = 'OPENBUFF_CHATGPT_OAUTH_TOKEN'`, and `sdk/src/env.ts:56-60` resolves `process.env[CHATGPT_OAUTH_TOKEN_ENV_VAR] ?? process.env[OPENBUFF_CHATGPT_OAUTH_TOKEN_ENV_VAR]`.

## [MEDIUM] API/ABI contract — docs/environment-variables.md:33 — Implemented `NEXT_PUBLIC_OPENBUFF_APP_URL` is absent from environment variable docs
- **Risk:** Release/build operators can audit or configure the wrong public app URL surface because the env docs say to document only implemented aliases but omit an implemented `NEXT_PUBLIC_OPENBUFF_APP_URL` field.
- **Fix:** Either document the exact `NEXT_PUBLIC_CODEBUFF_APP_URL`/`NEXT_PUBLIC_OPENBUFF_APP_URL` contract and precedence, or remove the unused optional `NEXT_PUBLIC_OPENBUFF_APP_URL` schema field if it is not public API.
- **Evidence:** `common/src/env-schema.ts:7-8` validates `NEXT_PUBLIC_CODEBUFF_APP_URL: z.url().min(1),` and `NEXT_PUBLIC_OPENBUFF_APP_URL: z.url().min(1).optional(),` while `docs/environment-variables.md:33-41` lists implemented Openbuff/Codebuff variables but does not mention `NEXT_PUBLIC_OPENBUFF_APP_URL` and states `Do not document an \`OPENBUFF_*\` alias unless the code implements it.`
