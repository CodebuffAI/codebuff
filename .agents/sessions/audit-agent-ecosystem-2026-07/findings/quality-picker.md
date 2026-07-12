# Quality/recovery agent file-picker audit

## Compact inventory for paired code-searcher

| Flow | Primary files / symbols | Current contract |
|---|---|---|
| Final code review | `agents/reviewer/code-reviewer.ts:9-105` (`createReviewer`); `agents/base2/base2.ts:1278-1398`; `agents/base2/gate-reviewer.ts:23-64,256-349` | Read-only reviewer, text/optional JSON verdict; `BLOCKING` and `coverage: missing` reopen the gate. |
| Validation repair | `agents/base2/base2.ts:983-1273`; `agents/base2/gate-repair.ts:47-177`; `agents/base2/gate-state.ts:49-90` | Parse hook errors, run up to 3 targeted editor repairs, then one broader editor escalation. |
| Auxiliary quality agents | `agents/base2/base2.ts:653-805,1693-1849`; `agents/base2/gate-state.ts:92-117` | For each aux-relevant pending set: test-writer -> doc-writer -> security-reviewer, then validation + code-reviewer. |
| Security review leaf | `agents/security-reviewer/security-reviewer.ts:5-48`; policy at `agents/base2/quality-prompt-section.ts:98-126` | Read-only adversarial review; unstructured last-message report. |
| Test mutation leaf | `agents/test-writer/test-writer.ts:6-65`; target selection at `agents/base2/base2.ts:1721-1770` | Reads source, writes tests, reports a parent-owned command; cannot validate. |
| Docs mutation leaf | `agents/doc-writer/doc-writer.ts:6-75`; target selection at `agents/base2/base2.ts:1772-1795` | Reads source/docs and mutates docs; automated gate always supplies `docs/agents-and-tools.md`. |
| Debugging leaf | `agents/debugger/debugger.ts:6-76` | Immediately runs supplied reproduce command, reads suspects, then model-driven diagnosis; report only, no fix. |
| Git workflow | `agents/git-committer/git-committer.ts:6-107`; policy at `agents/base2/quality-prompt-section.ts:128-149` | Optional branch, status/diff/log, optional `git add -A`, then model-driven stage/commit. |
| Tests/wiring | `agents/__tests__/code-reviewer.test.ts`; `gate-reviewer.test.ts`; `gate-repair.test.ts`; `gate-aux-triggers.test.ts`; `git-committer.test.ts`; `new-bundled-agents.test.ts`; `agents/e2e/gate-lifecycle.e2e.test.ts`; `reviewer-spawn-conditions.e2e.test.ts`; `gate-aux-ordering.e2e.test.ts` | Strong parser/order/happy-path coverage; leaf-agent tests are mostly prompt/schema checks. |

Suggested searches: `spawn_agent_inline`, `testWriterGateDone|docWriterGateDone|preEditSecurityReviewDone`, `collectReviewerBlockers|getReviewerFinalizationVerdict|detectReviewerCrash`, `MAX_REPAIR_ROUNDS|repairEscalationDone`, `stage_all|branch_name|git add -A`, and all consumers of aux-agent results.

## Findings

### [HIGH] Security / correctness / error handling — auxiliary agent results are discarded

- **Evidence:** each aux flag is marked done before spawning, and the yielded result is never assigned or parsed: test-writer `agents/base2/base2.ts:709-730`, doc-writer `:745-766`, security-reviewer `:780-798`; the loop simply continues at `:800-805`. By contrast, code-reviewer output is captured and gated at `:1282-1398`. The orchestrator promises that a `BLOCKING` security finding blocks completion at `agents/base2/base2.ts:203-206`.
- **Risk/UX:** a security reviewer can report a critical exploit, or any aux agent can crash/timeout, and the runtime still proceeds to final validation/review with no user-visible result. The done flag prevents retry for that pending set.
- **Fix:** give each aux agent a small structured result (`status`, `findings`, `files_changed`, `validation_command`), parse crash/blocking outcomes before setting done, persist them in active-work state, and emit a visible gate-state block.

### [HIGH] State mutation / correctness / performance — tests and docs run for nearly every source edit, not when acceptance criteria require them

- **Evidence:** every recognized non-test source file becomes a test-writer target (`agents/base2/base2.ts:1745-1770`), and nearly every `packages/*/src`, `agents/*`, `common/src`, or `cli/src` file is classified as public API for doc-writer (`:1772-1795`). The runtime automatically spawns both before validation (`:695-771`). This conflicts with the parent policy to spawn them when coverage/docs are required or implied (`:194,205-216`). Tests explicitly lock in this broad behavior at `agents/__tests__/gate-aux-triggers.test.ts:210-359`.
- **Risk/UX:** trivial refactors can incur two extra model calls and unsolicited test/doc mutations. Internal implementation changes can rewrite public docs, increasing latency, cost, review noise, and risk of inaccurate documentation.
- **Fix:** predicate on change intent/public contract or reviewer coverage verdict; first detect existing coverage/docs gaps, then spawn only when needed. Report why each mutation agent was triggered.

### [HIGH] Correctness / UX — doc-writer is hard-wired to the wrong documentation destination

- **Evidence:** all selected source files are handed to doc-writer with `target_doc_files: ['docs/agents-and-tools.md']` (`agents/base2/base2.ts:743-764`), although the leaf contract says infer/read the appropriate neighboring docs (`agents/doc-writer/doc-writer.ts:21-31,51-58`). The E2E test codifies the fixed destination (`agents/e2e/gate-aux-ordering.e2e.test.ts:35-42,113-124`).
- **Risk/UX:** SDK, CLI, common, or arbitrary package API changes may be documented in an agent-system guide, while the actual package README/API guide stays stale.
- **Fix:** add deterministic path-to-doc routing (package README/docs ownership), allow multiple candidate docs, and require the agent to return “no docs change needed” without mutation.

### [HIGH] Security / API contract — “pre-edit” security policy is implemented post-edit and has no gate verdict contract

- **Evidence:** policy requires advisory review before the editor (`agents/base2/quality-prompt-section.ts:110-125`), while the automated spawn occurs only after `editsHappened` and after test/doc writers (`agents/base2/base2.ts:680-799`). The state is nevertheless named `preEditSecurityReviewDone` (`agents/base2/gate-state.ts:92-98`). The security reviewer returns unstructured `last_message` (`agents/security-reviewer/security-reviewer.ts:30-48`) and does not share the code-reviewer labels/schema.
- **Risk/UX:** terminology and timing mislead maintainers; security guidance arrives too late to shape implementation and cannot participate reliably in blocking/finalization.
- **Fix:** separate `advisoryPreEditSecurityReview` from `blockingPostEditSecurityReview`; give the latter the same structured verdict/crash/coverage plumbing as code-reviewer.

### [HIGH] Error handling / UX — reviewer crash recovery advertises a bypass that the state machine cannot perform

- **Evidence:** on crash the runtime says retry once, switch reviewer, or “proceed without the reviewer gate” (`agents/base2/base2.ts:1350-1375`), but `runReviewerGate` is always identical to `runValidationGate` (`:388-390`), no retry counter/override/alternate reviewer is stored in `Base2ActiveWorkState`, and the branch ends with `continue` (`:1396`). The next completion attempt re-enters the same reviewer spawn.
- **Risk/UX:** persistent provider/model failures can trap a task in a reviewer loop despite instructions not to loop.
- **Fix:** implement bounded retry state, configurable fallback reviewer, and an explicit user-authorized bypass carrying a durable skipped gate-state reason.

### [HIGH] Security / git safety — secret scanning and command restrictions are prose, not enforced controls

- **Evidence:** policy claims git-committer scans secrets automatically (`agents/base2/quality-prompt-section.ts:142-147`), but the deterministic steps only run status, full diff, log, optional `git add -A`, then unrestricted model steps (`agents/git-committer/git-committer.ts:80-106`). `run_terminal_command` remains available (`:43-50`), so “no push/config/amend/rebase” is prompt-only (`:55-62`).
- **Risk/UX:** `stage_all` can stage unrelated or secret files, and a model error can execute prohibited git operations. The user receives no structured staged-file/secret-scan proof.
- **Fix:** replace raw shell git mutation with dedicated stage/commit tools, enforce a path allowlist and secret scan before commit, reject `.env`/credential patterns mechanically, and return structured commit/staged-file verification.

### [MEDIUM] Correctness / UX — branch creation flow contradicts dirty-tree behavior

- **Evidence:** schema warns `git_branch` refuses a dirty tree and suggests committing first (`agents/git-committer/git-committer.ts:26-35`), but `handleSteps` always calls `git_branch` first (`:64-78`); the prompt then suggests committing existing changes on the current branch before creating the requested branch (`:55-57`). The direct test asserts branch-first behavior only (`agents/__tests__/git-committer.test.ts:137-147`).
- **Risk/UX:** the common “dirty tree + create feature branch + commit” request fails on its first action; the suggested recovery may leave the commit on the old branch rather than the requested feature branch.
- **Fix:** inspect status first, then use an explicit user choice/`allow_dirty` branch switch or create the branch without switching and switch safely; add dirty-tree E2E coverage.

### [MEDIUM] Security / error handling — debugger executes the supplied command before assessing safety or boundedness

- **Evidence:** `reproduce_command` is yielded immediately (`agents/debugger/debugger.ts:60-67`) before the model can inspect it, with no explicit timeout/process type. The “max 3 attempts” rule is prompt-only (`:49-58`), and the generic leaf tests only inspect tools/prompt text (`agents/__tests__/new-bundled-agents.test.ts:117-133`).
- **Risk/UX:** a mistaken destructive, interactive, watcher, or production-affecting command can run automatically; hangs/timeouts and repeated-attempt behavior are not structurally controlled.
- **Fix:** add command classification/approval, explicit timeout and non-interactive defaults, mechanically count attempts, and return structured `reproduced | not_reproduced | timed_out | unsafe_command` status.

### [MEDIUM] Correctness / recovery gap — repeated validation failures never route to debugger

- **Evidence:** orchestrator policy says use debugger after repeated/unclear failures (`agents/base2/base2.ts:205,214-216`), but the automated repair path runs three editor rounds and one broader editor escalation (`:1042-1077,1157-1188`) and never spawns debugger.
- **Risk/UX:** diagnosis and mutation are conflated; repeated speculative edits can consume the repair budget without producing a durable root-cause report.
- **Fix:** after the first repeated identical failure (or unparseable output), invoke debugger read-only, feed its structured diagnosis into one final editor repair, then revalidate.

### [LOW] Performance / review quality — code-reviewer inherits the entire conversation but has weak navigation

- **Evidence:** reviewer includes message history (`agents/reviewer/code-reviewer.ts:37-38`) while its only tool is `read_files` (`:22-30`), despite being asked to inspect closely related context (`:53`).
- **Risk/UX:** long tasks pay high context cost, while the reviewer cannot search callers/symbols unless the parent already supplied paths.
- **Fix:** pass a compact review bundle (request, changed files, validation summary) with `includeMessageHistory: false`, and grant bounded outline/reference search or precompute related files.

## Eight-domain coverage summary

- **Security:** high-risk gaps in discarded security verdicts, post-edit timing, debugger auto-exec, and unenforced git controls.
- **Correctness:** coarse aux triggers/doc routing, branch-order contradiction, and absent debugger handoff.
- **State mutation:** unsolicited test/doc writes; done flags are committed before successful aux completion.
- **Error handling:** code-review parsing is strong, but aux crash/timeout recovery and reviewer bypass are missing.
- **Performance:** three serial aux model calls can fire for one ordinary edit; reviewer carries full history.
- **Dependency hygiene:** no new third-party dependency issue found in this shard; the main hygiene risk is duplicating serialized inline helpers, partly guarded by parity tests.
- **Test coverage gaps:** reviewer parser/repair/order paths are well covered; missing behavioral E2E cases include aux BLOCKING/crash/timeout, leaf mutation reports, debugger timeout/unsafe command, git secret detection/dirty-tree recovery, and multi-package test-writer routing.
- **API/ABI contracts:** code-reviewer has a parseable verdict contract; security/debug/test/doc/git remain heterogeneous `last_message` contracts, preventing reliable orchestration and user-visible status.
