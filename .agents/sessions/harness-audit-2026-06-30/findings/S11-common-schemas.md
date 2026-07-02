# Shard S11 — Common schemas/types

**Auditor:** harness-audit-2026-06-30 / S11
**Scope:** `common/src/types/**`, `common/src/schemas/**`, `common/src/tools/**`, `common/src/constants/**`, `common/src/util/**`, `common/src/api-keys/**`, `common/src/mcp/**`, `common/src/templates/**`, `common/src/env-schema.ts`, `common/src/analytics*.ts`.
**Files inspected:** 180 TypeScript files / 23,592 LOC in the S11 scope, plus docs used to check env-schema drift (`docs/environment-variables.md`, `docs/codebuff-to-openbuff-migration.md`) and representative runtime handlers under `packages/agent-runtime/src/tools/handlers/tool/**` to verify shared Zod schemas against handler signatures.

## Audit Domains Covered
1. **Security** — MCP auth/header cache keying, API-key constants, env/analytics secret surfaces.
2. **Correctness** — Zod input/output schemas vs handler usage, generated template types, MCP config hashing.
3. **State mutation** — shared caches/singletons in common utilities and MCP client state.
4. **Error handling** — `ErrorOr` shape and call sites, Zod parse error paths, handler-result error shapes.
5. **Performance** — schema/template size, cache behavior, analytics sampling/logging utilities.
6. **Dependency hygiene** — common use of Zod, MCP SDK, lodash/import drift in inspected code paths.
7. **Test coverage gaps** — missing regression tests for schema/docs drift and MCP cache key auth variance.
8. **API/ABI contract breaks** — exported schemas/types, tool client/server payload boundaries, env variable contract drift.

---

## Findings

## HIGH security/state mutation/API-ABI — common/src/mcp/client.ts:57 — Remote MCP client cache key ignores headers
- **Risk:** Remote MCP clients with the same `type`, `url`, and `params` but different `headers` reuse the first cached client, so an Authorization/header change can silently call a server with stale or wrong credentials.
- **Fix:** Include `headers` (after the same normalization/substitution policy chosen for params/env) in `hashConfig()` for `http` and `sse`, and add a regression test that two configs differing only by `headers.Authorization` produce different client IDs.
- **Evidence:** `common/src/types/mcp.ts:13-17` makes `headers` part of the remote MCP config, and `common/src/mcp/client.ts:96` passes `substituteEnvInRecord(config.headers)` into the HTTP/SSE transport; however `hashConfig()` for `http`/`sse` only serializes `type`, `url`, and `params` (`common/src/mcp/client.ts:57-69`), and `getMCPClient()` returns the existing cached client when that incomplete key is present (`common/src/mcp/client.ts:77-80`).

## MEDIUM API-ABI/correctness — common/src/env-schema.ts:8 — `NEXT_PUBLIC_OPENBUFF_APP_URL` is implemented but env docs/migration docs still describe the public app URL surface as Codebuff-only
- **Risk:** Operators and release engineers following the docs can set or audit the wrong public app-url variable because `NEXT_PUBLIC_OPENBUFF_APP_URL` is present in the schema but omitted from `docs/environment-variables.md`, while the migration doc still says the `NEXT_PUBLIC_CODEBUFF_APP_URL` name is Codebuff-only and warns that adding `OPENBUFF_*` aliases requires coordinated build-config work.
- **Fix:** Either remove the unused optional `NEXT_PUBLIC_OPENBUFF_APP_URL` schema field if it is not part of the public contract, or update the env docs/migration table and any accessors/build config to state exactly how `NEXT_PUBLIC_CODEBUFF_APP_URL` and `NEXT_PUBLIC_OPENBUFF_APP_URL` are resolved.
- **Evidence:** `common/src/env-schema.ts:5-12` validates both `NEXT_PUBLIC_CODEBUFF_APP_URL` and optional `NEXT_PUBLIC_OPENBUFF_APP_URL`; `docs/environment-variables.md:5` only gives the generic `NEXT_PUBLIC_*` rule and the implemented-variable list at `docs/environment-variables.md:33-41` does not mention `NEXT_PUBLIC_OPENBUFF_APP_URL`; `docs/codebuff-to-openbuff-migration.md:104-109` marks `NEXT_PUBLIC_CODEBUFF_APP_URL` as the only implemented name and says adding `OPENBUFF_*` public aliases is not a simple runtime fallback.

## LOW API-ABI/test coverage — common/src/tools/params/tool/read-docs.ts:24 — `read_docs.max_tokens` default disagrees with its own tool description
- **Risk:** Agents see a contract that says omitted `max_tokens` defaults to 20,000, but the Zod schema actually defaults to 10,000, so documentation-heavy tool calls can return about half the expected context and tests will not catch the mismatch.
- **Fix:** Change either the schema default or the description so both say the same default, and add a tool-schema snapshot or parse test for documented defaults on common tool params.
- **Evidence:** `common/src/tools/params/tool/read-docs.ts:24` uses `.default(10_000)`, while the adjacent `.describe(...)` at `common/src/tools/params/tool/read-docs.ts:26-27` says `Defaults to 20000`.

---

## Reviewed but not flagged

- **Tool client/server schema split:** `common/src/tools/list.ts` intentionally has two layers: `CodebuffToolCall` uses `toolParams.*.inputSchema` for LLM/runtime handler inputs (`common/src/tools/list.ts:113-119`), while `clientToolCallSchema` models the already-processed client payloads (`FileChangeSchema`/`CHANGES`) sent by runtime handlers (`common/src/actions.ts:15-19`, `packages/agent-runtime/src/tools/handlers/tool/write-file.ts`, `str-replace.ts`, `create-plan.ts`, `edit-transaction.ts`). The apparent schema difference for `create_plan`, `str_replace`, `write_file`, and `edit_transaction` is therefore a boundary distinction rather than a direct handler-signature mismatch.
- **`ErrorOr` usage:** In the inspected S11 scope, `ErrorOr<T>` is defined centrally in `common/src/util/error.ts` and only appeared in common contracts/tests/templates in ways consistent with the discriminated `success: true/false` shape. I did not find a concrete `ErrorOr` misuse worth filing in this shard.
- **Analytics/env secret handling:** `common/src/analytics.ts`, `analytics-core.ts`, and `util/analytics-sampling.ts` were reviewed for obvious secret leakage and env-schema drift. No actionable finding beyond the env public app-url drift above was identified.

**No project source edits performed.** This shard only wrote its findings file under `.agents/sessions/harness-audit-2026-06-30/findings/`.
