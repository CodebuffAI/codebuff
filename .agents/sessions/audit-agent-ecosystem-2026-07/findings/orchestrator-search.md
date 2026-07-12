# Orchestrator core — code-searcher audit

## Verified findings

## [HIGH] Correctness / UX — agents/base2/base2.ts:557 — Step-cap exhaustion bypasses required validation and review
- **Risk:** A turn that exhausts `maxAgentSteps` after editing is moved to `final_response_allowed`, enables follow-up suggestions, and exits before its pending files are gated, making unfinished/unvalidated work look like a normal completion.
- **Fix:** Preserve `awaiting_validation`/pending files, emit a distinct `step_cap_reached` interrupted state, disable green completion affordances, and make the next turn resume the gate before unrelated work.
- **Evidence:** lines 557-569 explicitly skip the gate, set `currentPhase = 'final_response_allowed'`, and set `canSuggestFollowups = true`; this conflicts with the completion contract in `docs/agents-and-tools.md:36-37`. `agents/__tests__/base2.test.ts:1010-1064` codifies pending dirty files with this finalizable phase instead of testing safe recovery.

## [HIGH] Security / correctness / error handling — agents/base2/base2.ts:772 — Security-reviewer results and failures are discarded
- **Risk:** Critical findings, malformed output, crashes, and timeouts have no effect on orchestration; the final code reviewer may miss domain-specific security issues while the docs promise that blocking security findings prevent completion.
- **Fix:** Give `security-reviewer` a structured verdict contract, parse and persist blockers/crashes like `gate-reviewer.ts`, expose them in active state/UI, and require resolution or an explicit audited override.
- **Evidence:** lines 791-798 yield the reviewer without capturing `toolResult`; execution then only checks `auxGateFiredThisIteration` and continues. By contrast, the final reviewer captures/parses results at lines 1278-1400. The behavioral contract says security blockers prevent completion at `docs/agents-and-tools.md:27` and `agents/base2/base-deep.ts:53`.

## [HIGH] Correctness / observability — agents/base2/base2.ts:711 — Aux-gate telemetry declares success before an agent runs
- **Risk:** Operational telemetry and any UX built on it report both reviewer and validation as `passed` before test-writer, doc-writer, or security-reviewer has started; a crash/no-op can therefore leave a false-green audit trail.
- **Fix:** Add a first-class aux gate and lifecycle status (`started`, `passed`, `failed`, `timed_out`, `skipped`), emit success only after interpreting the child result, and never reuse final reviewer/validation fields for unrelated agents.
- **Evidence:** test-writer emits `reviewerStatus: 'passed'` and `validationStatus: 'passed'` at lines 711-718 before yielding at 720; doc-writer repeats this at 747-754; security-reviewer repeats it at 782-789. None captures or validates the subsequent result.

## [MEDIUM] Correctness / performance / UX — agents/base2/base2.ts:680 — Broad predicates force serial test/doc agents for routine internal edits
- **Risk:** Most source changes incur two blocking agent runs before validation, adding latency/cost and potentially generating unwanted tests or edits to a single unrelated documentation file; users receive no preview or opt-out.
- **Fix:** Trigger on changed behavior/public contract or acceptance criteria, route documentation to package ownership, batch independent advisory work where safe, and show the proposed gates before execution.
- **Evidence:** lines 680-805 run test-writer then doc-writer then security-reviewer sequentially; `selectDocWriterTargets` treats all `packages/*/src`, `agents/`, `common/src`, and `cli/src` as public API and always supplies `docs/agents-and-tools.md` at lines 743-763. `docs/agents-and-tools.md:358` confirms a normal CLI component edit fires both agents.

## [MEDIUM] Correctness / API contract — agents/base2/base2.ts:1759 — Cross-package test writing is routed with only the first package’s command
- **Risk:** A multi-package change sends all target files with one command derived from `targetFiles[0]`, so later packages get incorrect validation guidance and the implementation contradicts the documented “for each package” behavior.
- **Fix:** Partition by package and spawn per-package writers or pass a target-to-command mapping with package-specific ownership.
- **Evidence:** `selectTestWriterTargets` returns all eligible files but computes one `testCommand` from the first target at lines 1759-1769; `agents/__tests__/gate-aux-triggers.test.ts:275` locks in this behavior, while `docs/agents-and-tools.md:354` describes per-package commands.

## [MEDIUM] Security — agents/base2/gate-paths.ts:12 — Absolute paths outside the project pass gate normalization
- **Risk:** Injected or corrupted durable state can make gate fingerprinting read/hash files outside the repository, violating project containment and potentially exposing local file content to agent state/logging.
- **Fix:** Resolve and realpath each path, require it to remain under realpath(cwd), reject foreign Windows drives/UNC paths, and handle symlink escapes explicitly.
- **Evidence:** `normalizeGateFilePath` rejects `..` segments but returns `path.normalize(filePath)` for any absolute path at lines 12-40. The inline fingerprint code later resolves and reads gate paths (`agents/base2/base2.ts:2547-2650`). Tests cover cwd absolute paths but not foreign absolute paths or symlink escape (`agents/__tests__/gate-paths.test.ts:96-150`).

## [MEDIUM] API/UX / performance — agents/base2/base2.ts:104 — Context-pruner is simultaneously internal-only and publicly spawnable
- **Risk:** Mention-based routing or model choice can create a second visible context-pruner alongside the automatic hidden one, wasting a child run and confusing users about which pruning operation controls context.
- **Fix:** Remove it from public `spawnableAgents`, reserve `spawn_agent_inline` for runtime-owned pruning, and document it as an internal lifecycle service rather than a selectable specialist.
- **Evidence:** it appears in the base2 and base-deep spawn allowlists (`base2.ts:104-124`, `base-deep.ts:353-372`) while prompts prohibit spawning it (`base2.ts:222`, `base-deep.ts:67`); the runtime already invokes it every loop at `base2.ts:523-531`; docs advertise it as orchestrator-spawnable at `docs/agents-and-tools.md:17`.

## [LOW] Test coverage / state mutation — docs/request-flow.md:230 — Cancellation and restart are not exercised across orchestrator phases
- **Risk:** Escape/abort during an inline aux agent, validation repair, background reviewer wait, or `ask_user` can strand job IDs, done flags, blockers, or pending files and produce an incorrect resume phase.
- **Fix:** Add deterministic lifecycle tests that cancel and resume from each active phase, asserting pending files, background jobs, gate flags, user-visible status, and exactly-once child joins.
- **Evidence:** targeted test search found extensive gate predicate/parser tests but no scoped end-to-end cases for cancellation during `repair_loop`, aux spawns, `awaiting_review`, or background reviewer wait; cancellation behavior is only documented in `docs/request-flow.md:230-239`.

## Rejected / downgraded candidates

- **Reviewer result parsing is generally missing — rejected.** The final code-reviewer has substantial structured/text verdict parsing, blocker extraction, crash differentiation, durable fingerprints, and parity tests (`base2.ts:1278-1478`, `gate-reviewer.ts`, `agents/__tests__/gate-reviewer.test.ts`). The gap is specific to aux reviewers.
- **Aux agents race final validation — rejected.** `spawn_agent_inline` is intentionally blocking and the loop continues after each aux spawn (`base2.ts:680-805`); the issue is serial cost and discarded outcomes, not a concurrency race.
- **All absolute paths are invalid — rejected.** Paths inside cwd are intentionally normalized and tested. Only foreign absolute paths and symlink escapes lack containment.
- **Gate state has no CLI rendering — rejected.** CLI parses and renders dedicated gate blocks (`cli/src/utils/message-block-helpers.ts:30-90`, `cli/src/components/renderers/gate-state-box.tsx`, component tests). The stronger UX gap is false/underspecified aux lifecycle telemetry.
- **Dependency vulnerability — not established.** No third-party package/version issue was evidenced in this scope.

## Coverage across 8 domains

- Security: foreign absolute/symlink path containment; ignored security-review findings.
- Correctness: step-cap bypass, discarded aux outcomes, first-package routing, contradictory context-pruner contract.
- State mutation: pending gate state on step cap and cancellation/resume gaps.
- Error handling: aux crashes/timeouts/no-op outputs are not classified or surfaced.
- Performance: serial broad aux gates and duplicate-pruner possibility.
- Dependency hygiene: no concrete dependency issue found; inline/module helper duplication remains guarded by selective parity tests.
- Test coverage: dirty step-cap behavior is tested with the unsafe expectation; cancellation, aux failure, path escape, and multi-package orchestration need coverage.
- API/ABI contract: docs promise blocking security review and per-package commands, while implementation does neither; phase/telemetry vocabulary cannot represent aux lifecycle or step-cap interruption accurately.
