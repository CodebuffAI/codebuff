# Shard S5 — agents: base2 family + gate lifecycle

**Scope audited:** `agents/base2/base2.ts`, `base2-plan.ts`, `base2-execute-plan.ts`, `base2-fast.ts`, `base2-fast-no-validation.ts`, `base-deep.ts`, `base2-evals.ts`, `base-deep-evals.ts`, `gate-reviewer.ts`, `gate-state.ts`, `gate-files.ts`, `gate-paths.ts`, `gate-repair.ts`, `quality-prompt-section.ts`, and related tests under `agents/__tests__/`.

**Required hotspots checked:** gate-state marker drift, repair-loop escalation, stepPrompt/instructionsPrompt alignment, `MAX_REPAIR_ROUNDS`, durable `repairSessionId`, and lifecycle parity between `base2` / `base-deep` / `base2-execute-plan` / `base2-fast-no-validation`.

## Audit Domains Covered

1. **Security** — checked prompt-injection surfaces around `<gate-state>` reuse and path containment in gate file normalization.
2. **Correctness** — checked gate enable/disable semantics, reviewer verdict parsing, static-review lifecycle, repair-loop state transitions, and pass reuse.
3. **State mutation** — checked durable `base2ActiveWork` mutation, repair budget/session reset conditions, pending/gate-passed file sets, and background reviewer job state.
4. **Error handling** — checked validation-failure parsing, reviewer crash/no-verdict split, telemetry best-effort behavior, and background reviewer joins/timeouts.
5. **Performance** — checked unnecessary waits, duplicated validation/review work, background reviewer lifecycle, and repair-loop boundedness.
6. **Dependency hygiene** — checked inline-helper duplication between serialized `handleSteps` and extracted modules, plus parity tests.
7. **Test coverage gaps** — checked existing parity/unit tests for gate files/paths/reviewer/repair and coverage of escalation/static-review/reuse paths.
8. **API/ABI contract breaks** — checked exported agent wrapper option semantics, `Base2ActiveWorkState` serialized field compatibility, and `<gate-state>` payload shape.

## Findings

## [HIGH] correctness/state mutation — agents/base2/base2.ts:769 — Static background reviewer can be reused after validation failure and review stale code
- **Risk:** In `staticReviewOnly` mode, a reviewer spawned before validation remains in `activeWorkState.staticReviewerJobId` when validation fails; after the agent repairs the code and validation later passes, the gate can join the old reviewer job that reviewed the pre-repair diff, allowing stale approval or stale blockers to control finalization.
- **Fix:** On validation failure, either kill/clear `staticReviewerJobId` and spawn a fresh reviewer after the repaired validation pass, or tag background reviewer jobs with a pending-file fingerprint and discard jobs whose fingerprint no longer matches current files.
- **Evidence:** `const staticReviewConcurrency = runReviewerGate && editsHappened && staticReviewOnlyEnabled` spawns a background reviewer only when `!activeWorkState.staticReviewerJobId` (`agents/base2/base2.ts:769-799`), validation-failure paths set `currentPhase = 'blocked'` without clearing that job (`agents/base2/base2.ts:817-930`, `930-1038`), and the pass path later joins `activeWorkState.staticReviewerJobId` via `check_background_agent` (`agents/base2/base2.ts:1050-1069`).

## [HIGH] security/correctness — agents/base2/base2.ts:638 — Conversation `<gate-state>` reuse trusts unscoped message text instead of runtime-owned state
- **Risk:** The reuse path treats any parseable `<gate-state>{...}</gate-state>` found in collected message text as proof that validation/review passed for matching pending files; because it is not tied to a runtime-authored message, fingerprint, or nonce, a tool/subagent/user-supplied text block that appears after changed-file evidence in the same message can self-authorize gate reuse and skip validation/reviewer work.
- **Fix:** Only reuse gate passes from runtime-owned `base2ActiveWork.gatePassedFingerprint` or from messages with an unforgeable runtime marker/session id; at minimum, ignore `<gate-state>` blocks in user/subagent/tool content and require the same fingerprint check used by the durable pass path.
- **Evidence:** `getConversationGatePassForPendingFiles(currentPendingGateFiles, currentConversationMessages)` directly opens finalization (`agents/base2/base2.ts:638-690`), while `extractGateStateBlocksFromMessage` recursively collects text/content/json values and parses `/ <gate-state>([\s\S]*?)<\/gate-state> /g` without checking message role or provenance (`agents/base2/base2.ts:1478-1519`).

## [MEDIUM-HIGH] API/ABI contract breaks — agents/base2/base2.ts:35 — `hasNoValidation` is prompt-only but the runtime gate ignores it
- **Risk:** `createBase2(..., { hasNoValidation: true })` changes instructions and todos to say validation may be skipped, but `handleSteps` still enables the validation/reviewer gate unless `agentState.agentId` is exactly `base2-fast` or `base2-fast-no-validation`; custom wrappers or future variants can expose a no-validation contract that the lifecycle does not honor.
- **Fix:** Derive `runValidationGate` from the captured `hasNoValidation` option (or a single canonical runtime option) instead of hard-coded ids, and add tests for custom `createBase2('default', { hasNoValidation: true })` and nonstandard fast ids.
- **Evidence:** `hasNoValidation = mode === 'fast'` is accepted in the factory (`agents/base2/base2.ts:35`) and passed into prompt builders (`agents/base2/base2.ts:306-321`), but runtime uses `const runValidationGate = agentId !== 'base2-fast' && agentId !== 'base2-fast-no-validation'` (`agents/base2/base2.ts:340`).

## [MEDIUM] error handling/performance — agents/base2/base2.ts:1061 — Static-review join waits only for `LOOKS_GOOD` even though `NON_BLOCKING` is an accepted pass
- **Risk:** The reviewer contract accepts `LOOKS_GOOD` and `NON_BLOCKING` as finalization verdicts, but the background join waits for `LOOKS_GOOD` only; a static reviewer that correctly returns `NON_BLOCKING` may incur an unnecessary 120-second wait or timeout/no-verdict path depending on `check_background_agent` semantics.
- **Fix:** Change the join contract to wait for any final verdict (`LOOKS_GOOD`, `NON_BLOCKING`, or `BLOCKING`) or omit `wait_for` and parse the completed result with the same `getReviewerFinalizationVerdict`/`collectReviewerBlockers` functions.
- **Evidence:** The reviewer prompt says the first visible token may be `BLOCKING:`, `NON_BLOCKING:`, or `LOOKS_GOOD:` (`agents/base2/base2.ts:788`, `1087`), but `check_background_agent` is called with `wait_for: 'LOOKS_GOOD'` and `timeout_seconds: 120` (`agents/base2/base2.ts:1055-1065`).

## [MEDIUM] security — agents/base2/gate-paths.ts:15 — Gate path normalizer claims project containment but allows absolute non-cwd paths
- **Risk:** `normalizeGateFilePath` rejects `..` segments but returns absolute paths that are not under `process.cwd()`, contrary to its comment that gate file paths must stay inside the project; a malicious or malformed edit artifact can place `/tmp/...` or `/etc/...` into pending gate prompts/hooks instead of being dropped.
- **Fix:** After stripping `file://`, drive-prefix quirks, cwd, and leading `./`, reject any remaining absolute POSIX path or Windows drive path outside the cwd.
- **Evidence:** The helper comments “a gate file path must stay inside the project” and rejects only `..` before stripping cwd (`agents/base2/gate-paths.ts:15-22`), then returns `normalized.trim()` without rejecting paths that still begin with `/` or a drive prefix outside cwd (`agents/base2/gate-paths.ts:23-38`); the same inline copy is used inside serialized `handleSteps` (`agents/base2/base2.ts:1400-1425`).

## [MEDIUM] test coverage gaps/dependency hygiene — agents/base2/base2.ts:2649 — Escalation prompt helper is inline-only and lacks parity/unit tests
- **Risk:** The targeted repair prompt has an exported canonical helper and parity tests, but the escalation prompt is only defined inside serialized `handleSteps`; future changes can drift silently, and there are no tests asserting the escalation round includes root-cause instructions, pending files, or `MAX_REPAIR_ROUNDS` context.
- **Fix:** Extract `buildEscalationEditorPrompt` to `gate-repair.ts`, add it to the inline parity test, and add unit tests covering parseable/unparseable failures and pending-file rendering.
- **Evidence:** `gate-repair.ts` exports and tests only `parseValidationFailures` and `buildRepairEditorPrompt` (`agents/base2/gate-repair.ts:47-153`; `agents/__tests__/gate-repair-parity.test.ts:18-25`), while `buildEscalationEditorPrompt` exists only inline in `base2.ts` (`agents/base2/base2.ts:2649-2715`).

## [LOW-MEDIUM] state mutation/test coverage gaps — agents/base2/base2.ts:932 — Escalation state is not covered by the same marker/telemetry tests as repair-incomplete
- **Risk:** The repair-loop test suite asserts `repairRound`/`maxRepairRounds` only for the first repair-incomplete marker, leaving the post-budget escalation path untested; regressions in `repairEscalationDone`, `repairSessionId` persistence, or the final `escalation-exhausted` marker could break lifecycle observability without failing tests.
- **Fix:** Add generator tests that seed `repairRoundCount = MAX_REPAIR_ROUNDS`, exercise the escalation editor success and failure paths, and assert `repairEscalationDone`, `repairSessionId`, telemetry fields, and `<gate-state>` details.
- **Evidence:** Escalation is implemented at `canEscalate = hasParseableFailures && !activeWorkState.repairEscalationDone` and sets `repairEscalationDone = true` (`agents/base2/base2.ts:932-990`), but the current repair telemetry tests only assert “repair-incomplete” round `1/3` and non-repair backward compatibility (`agents/__tests__/base2.test.ts:2716-2821`).

## [LOW] dependency hygiene/API contract — agents/base2/gate-state.ts:52 — `MAX_REPAIR_ROUNDS` is documented in public state comments but not exported as a shared constant
- **Risk:** `Base2ActiveWorkState` documentation and tests hard-code the default repair budget as `3`, while the actual constant is local to serialized `handleSteps`; changing the runtime budget requires remembering to update comments, tests, marker expectations, and escalation prompts separately.
- **Fix:** Export a single `BASE2_MAX_REPAIR_ROUNDS` constant from a non-serialized module and copy it into the serialized closure through factory capture, then update tests to import the constant instead of hard-coding `3`.
- **Evidence:** The type comment says `Bounded by MAX_REPAIR_ROUNDS in base2.ts (default 3)` (`agents/base2/gate-state.ts:50-54`), the runtime defines `const MAX_REPAIR_ROUNDS = 3` inside `handleSteps` (`agents/base2/base2.ts:343`), and tests assert `maxRepairRounds` equals `3` (`agents/__tests__/base2.test.ts:2789`).

## Domain notes with no additional findings

- **StepPrompt/instructionsPrompt alignment:** Base2 default, execute-plan, plan-only, fast, and base-deep prompts are broadly aligned with their lifecycle modes. The main prompt/lifecycle drift found is the `hasNoValidation` API mismatch above, not the visible step text for built-in ids.
- **Repair-session lifecycle:** `repairSessionId`, `repairRoundCount`, and `repairEscalationDone` are reset on durable pass and ordinary gate pass (`agents/base2/base2.ts:714-716`, `1197-1199`) and protected from non-repair reset while a repair session is active (`agents/base2/base2.ts:1381-1383`). The missing coverage is specifically the escalation path.
- **Lifecycle parity:** `base-deep` composes `createBase2('default', { noAskUser })`, so it inherits the gate runtime; `base2-evals` and `base-deep-evals` mainly toggle ask/learning prompts. No separate parity defect found beyond the shared issues above.

**Findings count:** 8

**No project source files were modified.**
