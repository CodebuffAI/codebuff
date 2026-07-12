# Quality/recovery specialists — code-searcher audit

## Verified findings

## [HIGH] Security / correctness / error handling — agents/base2/base2.ts:695 — Auxiliary quality-agent outcomes are discarded
- **Risk:** Security-reviewer can report a critical exploit, or test/doc/security agents can crash, time out, or no-op, yet orchestration proceeds and the pre-set done flag prevents retry for the same pending set.
- **Fix:** Standardize structured aux results (`status`, `findings`, `files_changed`, `validation_command`), interpret them before marking done, persist blockers/crashes in active state, and render a visible lifecycle result.
- **Evidence:** test/doc/security flags are set before yields and results are never assigned (`base2.ts:695-805`); final code-reviewer output is captured and gated at `:1278-1398`. Docs promise blocking security findings prevent completion (`docs/agents-and-tools.md:27`).

## [HIGH] Correctness / UX — agents/base2/base2.ts:743 — Doc-writer routes every source domain to one agent-system guide
- **Risk:** SDK, CLI, common, and arbitrary package changes can generate edits in `docs/agents-and-tools.md` while their actual README/API docs remain stale, producing misleading documentation churn.
- **Fix:** Maintain deterministic package/path-to-doc ownership, allow multiple candidate targets, and support a structured “no documentation change required” result.
- **Evidence:** every selected source file is passed with `target_doc_files: ['docs/agents-and-tools.md']` at lines 743-764; the leaf itself says to inspect appropriate neighboring docs (`agents/doc-writer/doc-writer.ts:21-31,51-58`); E2E locks in the fixed destination (`agents/e2e/gate-aux-ordering.e2e.test.ts:113-124`).

## [HIGH] Security / API contract — agents/base2/quality-prompt-section.ts:110 — “Pre-edit” security review runs only after mutations
- **Risk:** Maintainers and users may believe risky design is reviewed before implementation, but security feedback arrives after editor/test/doc mutations and cannot reliably block because it lacks a verdict contract.
- **Fix:** Split advisory pre-edit threat modeling from blocking post-edit security review; run the former before editor for high-risk scopes and give the latter code-reviewer-compatible verdict/crash plumbing.
- **Evidence:** policy requests review before editing (`quality-prompt-section.ts:110-125`), while the automatic gate requires `editsHappened` and runs security third after test/doc writers (`base2.ts:680-799`). State still calls it `preEditSecurityReviewDone` (`gate-state.ts:92-98`), and security-reviewer returns unstructured `last_message` (`security-reviewer.ts:30-48`).

## [HIGH] Error handling / UX — agents/base2/base2.ts:1359 — Reviewer crash guidance describes recovery paths that do not exist
- **Risk:** Persistent reviewer/provider failure can trap the workflow in the same blocked re-entry loop while telling the operator to switch reviewer or bypass the gate.
- **Fix:** Add durable retry count, configured fallback reviewer, and explicit user-authorized bypass with a skipped gate-state reason and audit trail.
- **Evidence:** crash text says retry, switch, or proceed without the gate at lines 1359-1375, but the branch only `continue`s at 1396; `runReviewerGate` mirrors `runValidationGate` (`base2.ts:388-390`), and active state has no override/fallback selection.

## [HIGH] Security / state mutation — agents/git-committer/git-committer.ts:43 — Git safety and secret prevention are prompt-only
- **Risk:** `stage_all` can include unrelated/secret files and unrestricted shell access can push, amend, rebase, alter config, or commit credentials despite the prose prohibition; output provides no machine-verifiable scan/staged-file proof.
- **Fix:** Replace raw mutation commands with dedicated stage/commit tools, enforce path scope and secret scanning, mechanically deny prohibited operations, and return a structured receipt containing staged files, scan result, commit hash, and subject.
- **Evidence:** tools include unrestricted `run_terminal_command` at lines 43-50; deterministic flow can execute `git add -A` at 97-103 then grants `STEP_ALL`; “do not push/commit secrets/amend/rebase” exists only in prompt lines 55-62. The shared policy claims automatic secret scanning (`quality-prompt-section.ts:142-147`) without an implementation step.

## [MEDIUM] Correctness / UX — agents/git-committer/git-committer.ts:64 — Branch creation contradicts dirty-tree recovery guidance
- **Risk:** The common “create feature branch and commit current dirty work” request fails immediately; suggested recovery commits on the old branch, contrary to user intent.
- **Fix:** Inspect status first, then explicitly choose safe dirty-work transfer semantics (create/switch with authorized dirty carry, stash, or user choice) before committing.
- **Evidence:** schema notes `git_branch` refuses dirty trees (`:26-35`), yet `handleSteps` invokes it before status/diff at `:64-85`; prompt simultaneously says commit existing changes first on the current branch (`:55-57`). Tests assert branch-first ordering but not dirty-tree behavior.

## [MEDIUM] Security / error handling — agents/debugger/debugger.ts:60 — Debugger auto-executes an unclassified reproduce command
- **Risk:** A destructive, interactive, watcher, network, or production-affecting command runs before the model can inspect safety; no explicit timeout/process type or structural attempt limit exists.
- **Fix:** Apply the runtime command approval classifier, default to bounded synchronous/non-interactive execution, validate command shape, and mechanically enforce attempt count with typed outcomes.
- **Evidence:** `reproduce_command` is yielded immediately at lines 60-67 with only `{command}`; “no more than 3 attempts” is prompt-only at 49-58. Leaf tests cover prompt/tool presence, not unsafe command/timeout behavior.

## [MEDIUM] Correctness / recovery UX — agents/base2/base2.ts:1042 — Repeated validation failures never invoke the debugger specialist
- **Risk:** Diagnosis and mutation remain conflated: three targeted editor attempts plus another broad editor can repeatedly guess at symptoms without producing an evidence-backed root cause.
- **Fix:** Detect repeated identical/unparseable failures, spawn debugger read-only, persist its diagnosis, then provide that evidence to one bounded final editor repair.
- **Evidence:** automated path performs editor repairs at lines 1042-1155 and a broader editor escalation at 1157-1200; no debugger spawn occurs. Orchestrator/docs prescribe debugger after repeated or unclear failures (`docs/agents-and-tools.md:26`, `base-deep.ts:55,63`).

## [MEDIUM] Performance / state mutation — agents/base2/base2.ts:1745 — Broad aux predicates trigger unsolicited test/doc mutations
- **Risk:** Routine internal refactors incur serial model calls and code/doc churn even when acceptance criteria do not require new tests or public documentation.
- **Fix:** Base triggers on behavior/public-contract changes, detected coverage/docs gaps, or explicit acceptance criteria; preview trigger reasons and allow scoped opt-out.
- **Evidence:** any recognized non-test source selects test-writer (`:1745-1769`), while nearly all source roots select doc-writer (`:1772-1795`). This conflicts with policy describing these agents for required/implied coverage (`docs/agents-and-tools.md:28`).

## [LOW] Performance / review quality — agents/reviewer/code-reviewer.ts:22 — Reviewer receives full history but lacks search/navigation
- **Risk:** Long conversations increase reviewer cost while the only tool cannot efficiently discover callers/references beyond parent-supplied paths, weakening cross-file review.
- **Fix:** Pass a compact review bundle with `includeMessageHistory: false`, plus bounded outline/reference search or precomputed related files.
- **Evidence:** reviewer sets `includeMessageHistory: true` at line 38 but permits only `read_files` at 22-29, while requiring closely related context at 53.

## Rejected / downgraded candidates

- **Final code-reviewer has no enforceable contract — rejected.** It has explicit text/JSON verdict labels, blocker/coverage parsing, crash detection, durable fingerprints, and strong parser/lifecycle tests. Heterogeneity is confined to the other quality agents.
- **Aux quality agents race each other — rejected.** Inline spawning blocks and order is tested; the problem is serial cost and ignored results, not a race.
- **Test-writer falsely claims it validates tests — rejected.** Current docs explicitly state it reports a parent-owned command and does not execute validation (`docs/agents-and-tools.md:140-155`).
- **Git branch tool itself cannot support dirty switching — downgraded.** SDK includes an `allow_dirty` capability, but git-committer’s schema/flow neither exposes nor uses it safely; the finding is agent UX/ordering.
- **Dependency hygiene issue — not established.** No undeclared/vulnerable package was evidenced; serialized helper duplication remains a maintenance concern covered partially by parity tests.

## Coverage across 8 domains

- Security: ignored security verdicts, misleading timing, prompt-only git controls, debugger command auto-execution.
- Correctness: doc routing, impossible reviewer recovery guidance, branch ordering, absent debugger handoff.
- State mutation: aux done-before-success, unsolicited test/doc writes, unsafe stage-all semantics.
- Error handling: aux and reviewer crash recovery gaps; debugger lacks typed timeout/unsafe outcomes.
- Performance: broad serial aux calls and full-history reviewer context.
- Dependency hygiene: no concrete third-party issue found.
- Test coverage: strong final-review parser/order coverage; missing aux blocker/crash/timeout, dirty branch, secret scan, debugger safety, and repeated-failure diagnosis tests.
- API/ABI contract: only code-reviewer has a reliable verdict; other quality agents use heterogeneous last-message outputs that orchestration cannot safely consume.
