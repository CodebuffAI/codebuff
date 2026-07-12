# Runtime/contracts/routing — code-searcher audit

## Verified findings

## [HIGH] Security — sdk/src/agents/load-agents.ts:243 — Resolved MCP secrets can be logged inside agent templates
- **Risk:** Environment references become plaintext credentials and full-template debug logging can persist them locally.
- **Fix:** Keep secret references opaque until process launch and centrally redact `mcpServers.*.env` and provider secrets from every log serializer.
- **Evidence:** local loading resolves MCP env values (`load-agents.ts:73-79,243-255`), while runtime step/spawn debug records include the whole `agentTemplate` (`run-agent-step.ts:456-474`, `spawn-agent-utils.ts:448-456`).

## [HIGH] Security / permissions contract — packages/agent-runtime/src/run-programmatic-step.ts:700 — `handleSteps` bypasses declared tool capabilities
- **Risk:** A template presented as read-only can yield terminal, edit, spawn, or network tools omitted from `toolNames`, undermining template permissions and docs claiming secure sandbox/tool declarations.
- **Fix:** Enforce the effective allowed-tool set for programmatic yields, with explicit narrowly scoped internal capabilities for trusted orchestrators.
- **Evidence:** the availability check is commented out with “You can run any tool from handleSteps now!” (`run-programmatic-step.ts:700-717`), then arbitrary calls reach execution (`:750-759`); docs state templates define tool permissions (`docs/agents-and-tools.md:11`).

## [HIGH] Security / performance — packages/agent-runtime/src/tools/handlers/tool/web-search.ts:67 — Direct URL search enables SSRF and unbounded body buffering
- **Risk:** Agents can fetch localhost, LAN, link-local/cloud-metadata, or redirected private endpoints; large responses are fully buffered before character truncation.
- **Fix:** Restrict to HTTP(S), resolve/block private/reserved addresses on every redirect, stream with a hard byte cap, and combine timeout with run cancellation.
- **Evidence:** schema only requires `z.string().url()` (`common/src/tools/params/tool/web-search.ts:17-23`); handler directly `fetch`es and awaits `response.text()` (`web-search.ts:67-105`).

## [HIGH] Correctness / state mutation — packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts:95 — Mixed background batches can launch unreachable orphan agents
- **Risk:** Earlier background entries start before a later invalid entry throws; because results/job IDs are returned only after batch processing, the parent cannot poll or cancel already-launched work.
- **Fix:** Pre-validate the full batch atomically, then launch; return per-entry settled reports and always expose IDs for successful starts.
- **Evidence:** background validation/launch happens sequentially in the initial loop (`spawn-agents.ts:95-203`), while `backgroundReports` is returned only at the end and validation failures are not isolated per entry.

## [HIGH] State mutation / information exposure / performance — packages/agent-runtime/src/util/background-agent-jobs.ts:76 — Background agent registry retains full internal run state indefinitely
- **Risk:** Settled jobs accumulate message history, prompts, tool definitions, and proposal state in a process-wide map, then polling injects that oversized internal state back into the parent.
- **Fix:** Store a normalized/redacted result, add consume/delete plus TTL/LRU limits, cap registry size, and expose explicit lifecycle cleanup.
- **Evidence:** `job.result = result` (`background-agent-jobs.ts:161-170`), no pruning exists (`:76,195-215`), and `check-background-agent.ts:61-109` returns the result verbatim.

## [HIGH] Correctness / cancellation — sdk/src/tools/run-terminal-command.ts:248 — Timeout/abort does not reliably terminate the command tree
- **Risk:** The tool rejects while a stubborn shell or descendants continue running; abort fallback tests `childProcess.killed`, which only means a signal was sent, not that exit occurred.
- **Fix:** own a process group, wait for observed close, escalate after grace based on actual exit, and test stubborn children/grandchildren.
- **Evidence:** timeout sends SIGTERM then immediately rejects without fallback (`:288-301`); abort escalation is gated by `if (!childProcess.killed)` (`:248-279`).

## [HIGH] Correctness / BYOK UX — packages/agent-runtime/src/run-agent-step.ts:835 — Runtime context status/pruning is disconnected from resolved model capacity
- **Risk:** BYOK 8k/32k models can be shown a 190k capacity and pruned too late; SDK emergency trimming may prevent failure but runtime behavior/status remains misleading.
- **Fix:** propagate resolved `contextWindowTokens` from model routing into the agent loop and use one capability source for semantic pruning, budgets, and CLI status.
- **Evidence:** runtime falls back to `DEFAULT_MAX_CONTEXT_TOKENS` when `maxContextLength` is absent (`run-agent-step.ts:835-838,1203-1236`; `util/context-pruning.ts:23-76`); routing already resolves optional context capacity (`sdk/src/impl/model-provider.ts:152-154`), but no audited caller connects it.

## [MEDIUM] Error handling / UX contract — packages/agent-runtime/src/main-prompt.ts:200 — Invalid local-agent definitions emit an error and then continue
- **Risk:** One prompt can produce `prompt-error` followed by start/content/finish events, making terminal state ambiguous and potentially running a surviving/fallback agent despite broken configuration.
- **Fix:** Fail closed before `start` for the selected agent, or emit non-terminal per-file warnings for unrelated invalid definitions with explicit continuation semantics.
- **Evidence:** validation errors trigger `prompt-error` at `main-prompt.ts:200-241`, after which execution unconditionally emits `start` and calls `mainPrompt`.

## [MEDIUM] Correctness / discoverability — sdk/src/agents/load-agents.ts:135 — Home agents silently override project agents
- **Risk:** A global definition can unexpectedly replace repository-local behavior; duplicate IDs disappear before validation, leaving users unable to diagnose provenance/shadowing.
- **Fix:** Define project-over-parent-over-home precedence, retain all candidate provenance, and surface override diagnostics in the agent picker/startup report.
- **Evidence:** directories are processed project → parent → home and assigned with last-wins `agents[id] = ...` (`load-agents.ts:135-139,212-263`); duplicate test only asserts a surviving result (`sdk/src/__tests__/load-agents.test.ts:694-731`).

## [MEDIUM] API/ABI contract — common/src/types/agent-template.ts:148 — `maxSpawnDepth` is advertised but not loadable from dynamic config
- **Risk:** Users are told to configure a depth value that the local-agent/provider schema omits, so the setting is stripped or ignored.
- **Fix:** Add validated global/per-agent fields with precedence tests, or remove the unsupported configuration guidance.
- **Evidence:** runtime/template types read and recommend `maxSpawnDepth` (`agent-template.ts:148-156`, `spawn-agent-utils.ts:527-533`), while `DynamicAgentDefinitionSchema` omits it (`dynamic-agent-template.ts:175-217`) and provider config has no corresponding route.

## [MEDIUM] Telemetry / UX — packages/agent-runtime/src/tools/handlers/tool/spawn-agents.ts:349 — Background agent cost and lifecycle are missing from completion accounting
- **Risk:** Users can end a turn unaware of running background agents and see understated spend; shell jobs receive end-turn warnings but agent jobs do not.
- **Fix:** Unify pending job accounting, surface background agents at end/session exit, add cancel actions, and aggregate settled cost without double-counting.
- **Evidence:** only foreground child costs are accumulated (`spawn-agents.ts:349-390`, `main-prompt.ts:245-253`); `end-turn.ts` queries shell pending jobs, not the background-agent registry.

## Rejected / downgraded candidates

- **Filesystem/terminal cwd containment is absent — rejected.** SDK applies lexical plus realpath/symlink containment and has focused tests; command side effects still require a separate approval policy.
- **Structured-output agents must expose `set_output` to the model — rejected.** The schema intentionally permits programmatic `handleSteps` to yield `set_output` without granting it to the LLM, with tests documenting the compatibility behavior.
- **BYOK model routing is hosted/fallback dependent — rejected.** Local provider resolution is implemented and explicit failures guide users to `openbuff.json`; the verified gap is propagation of model capabilities into runtime pruning/status.
- **All spawn cancellation is missing — rejected.** Foreground spawn timeout/depth/cancellation tests exist. Gaps are mixed partial launch, background ownership/cleanup, and terminal process reaping.
- **Dependency hygiene broadly broken — rejected.** One fragile deep import in web search remains (`open-websearch/build/...`), but no broader undeclared dependency issue was established.

## Coverage across 8 domains

- Security: secret logging, programmatic capability bypass, SSRF, command-process cleanup exposure.
- Correctness: partial background launch, context-window mismatch, invalid-config event ambiguity, precedence/depth contract drift.
- State mutation: retained background state, orphan agents/processes, missing lifecycle cleanup.
- Error handling: error-then-continue configuration flow and non-atomic batch failures.
- Performance: full background state retention, unbounded web body, incorrect pruning threshold.
- Dependency hygiene: fragile web-search deep import only; no broader issue proven.
- Test coverage: missing SSRF/redirect/body-cap, programmatic permission, mixed-batch orphan, registry cleanup/redaction, stubborn process, precedence, and model-capability integration cases.
- API/ABI contract: unsupported spawn-depth config, silent override precedence, oversized background result shape, ambiguous validation event semantics.
