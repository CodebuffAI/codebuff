# STATUS — Harness Cohesion Audit & Remediation

## Current state
- **Phase:** Execution complete — all executable milestones (M1–M7) implemented and validated; awaiting the automated validation/reviewer gate on the changed source files. (Superseded the initial plan-only phase; see appended execution entries below.)
- **Mode:** EXECUTE_PLAN — the audit + durable packet were produced during planning, then source remediation was applied.

## Audit coverage (complete)
All six harness domains + prompt layer audited via parallel shards against snapshot `68f0ffb8…`:
1. Orchestrator family (base2 / base2-plan / base2-execute-plan / base2-fast / base-deep) — ✅
2. Gates & reviewers (aux gates, validation+reviewer gate, verdict parsing, parity tests) — ✅
3. Specialists (14) + risk router — ✅
4. Discovery/execution agents (19) — ✅
5. Tool-grant / reachability layer — ✅
6. Runtime coordination (spawn/handoff/receipt, orchestration/) — ✅
7. Prompt-section ↔ consumer cohesion — ✅

## Completed
- SPEC.md, PLAN.md, STATUS.md, LESSONS.md written.
- Findings synthesized into 7 milestones (M1–M7) with stable task IDs.
- All executable milestones implemented and validated: M1 (single source of truth), M2 (prompt↔capability), M3 (orchestrator family), M4 (gate drift guards), M5 (tool hygiene; M5.2 cancelled/resolved-by-quarantine), M6 (discovery boundaries), M7 (orchestration/ kept advisory). See the appended execution entries below.
- Follow-up reviewer read-budget fix landed in `sdk/src/tools/read-files.ts` (see the appended 2026-07-22 entry).

## Pending
- Automated validation/reviewer gate re-run against the fresh snapshot on the changed source files.

## Blocked / needs user decision
- M5.2 (genuinely remove `read_slices` from the published/generated tool type surface): left cancelled/resolved-by-quarantine because forcing it would break the external custom-agent published-tool type contract. Reopen only on explicit user direction.

## Next checkpoint
Await the automated validation/reviewer gate on the changed source files. If it clears, the remediation is complete; otherwise address any gate findings.

## Resume instructions
1. Read SPEC.md for the ranked findings + evidence.
2. Read PLAN.md for milestone/task IDs and validation gates.
3. Milestones M1–M7 are implemented; verify the appended execution entries against the live source before resuming.
4. Update this file via `update_plan_status` at each task boundary.

<!-- update_plan_status:appended -->
## Confirmed Decisions (2026-07) — 2026-07-21T20:48:18.665Z

- Canonical roster source of truth = `agents/**/*.ts` default exports (what the runtime actually loads/bundles).
- `openbuff.d.example/routes.json` and `common/src/constants/agents.ts` persona maps are DERIVED-OR-GUARDED against that canonical roster (reconcile current contents + add a drift-guard test), not a full gener-from-source refactor this pass.
- External CLI agents (claude-code-cli, codex-cli, gemini-cli, codebuff-local-cli, notion-*) and judges are an explicit documented allowlist for routes.json, not dead ids to delete blindly.
- Persona-map open question RESOLVED: reconcile + guard (smaller change), per user.


<!-- update_plan_status:appended -->
## M1.1 Roster Inventory Matrix — 2026-07-21T20:50:21.223Z

Canonical roster source = default exports under agents/**/*.ts (what the runtime loads), mirrored by getBundledAgentIds() in cli/src/agents/bundled-agents.generated.ts (46 ids). Guard test uses that generated list as truth.

routes.json DEAD ids (no shipped agent, no .agents/ local agent) -> REMOVE: base, file-explorer, researcher.

routes.json EXTERNAL/LOCAL ALLOWLIST (exist in .agents/ or evals judges) -> KEEP + document: claude-code-cli, codebuff-local-cli, codex-cli, gemini-cli, notion-query-agent, notion-researcher, judge-gpt, judge-gemini, judge-claude.

agents.ts AGENT_PERSONAS stale keys (not shipped) -> remove/remap: base (keep? used by graveyard only), ask, file-explorer, researcher, planner, agent-builder, reviewer. Note reviewer->code-reviewer rename; base retained as orchestrator persona alias but base2/base-deep are the real ids.

Consumers of AGENT_PERSONAS/AGENT_NAMES/AGENT_IDS (blast radius): common/src/util/agent-name-resolver.ts (Object.entries over AGENT_PERSONAS), cli display via AGENT_NAMES; graveyard base-factory.ts (dead, ignore). No shipped hard dependency on the stale keys except agent-name-resolver which tolerates any key set.

Not spawnable by any orchestrator (M1.5): directory-lister, glob-matcher.

Decision (confirmed by user): agents/**/*.ts exports are canonical; routes.json + persona maps are reconciled + drift-guarded, not fully generated this pass.


<!-- update_plan_status:appended -->
## M1 Complete (2026-07) — 2026-07-21T21:06:44.763Z

M1 single-source-of-truth milestone done. AGENT_PERSONAS reconciled to shipped roster (stale keys removed, ~18 shipped added, satisfies constraint relaxed to string-keyed record). routes.json pruned of 3 dead ids (base, file-explorer, researcher); 55 agents remain (shipped + external-CLI/eval allowlist). New guard agents/__tests__/roster-drift.test.ts (4 pass) checks personas/routes/spawnable reference only shipped-or-allowlisted ids AND every shipped non-root agent is reachable or intentionallyExcluded. M1.5: directory-lister/glob-matcher kept bundled, intentionally excluded from spawnability (mechanical work = direct glob/list_directory tools). common + cli typecheck green. Now on M2.1.


<!-- update_plan_status:appended -->
## M5.2 BLOCKED — conflict with compatibility invariants — 2026-07-21T21:26:26.377Z

M5.2 (remove read_slices from publishedTools + generated agents/types/tools.ts) contradicts two deliberate, test-encoded invariants in common/src/tools/__tests__/tool-registration-consistency.test.ts:
1. 'quarantined compatibility tools remain registered and published' asserts every quarantinedToolName (now read_slices + apply_smart_patch + the 4 newly-quarantined dead tools) MUST stay in publishedTools so persisted histories / external callers get a compatibility response, not an unknown-tool error.
2. 'generated agent tool types include every published-style tool name' requires the generated type surface to include every non-internal toolName; read_slices is not in the internal-only exclusion set.

read_slices is ALREADY prompt-invisible via quarantine metadata (reachability=quarantined, promptVisible=false), which is the real 'don't show the model' fix. Removing it from the published/generated surface would require weakening both guards AND changes the external custom-agent type contract (a compatibility break). Recommend M5.2 be re-scoped to no-op/already-resolved-by-quarantine. Awaiting user decision.


<!-- update_plan_status:appended -->
## Execution Complete (2026-07) — 2026-07-21T21:38:02.119Z

All executable milestones done and validated green:
- M1 (single source of truth): AGENT_PERSONAS reconciled; routes.json pruned of 3 dead ids; new roster-drift.test.ts (4 pass); directory-lister/glob-matcher intentionally-excluded decision encoded. common+cli typecheck green.
- M2 (prompt<->capability): buildBroadAuditSection now routes audit shards to general-agent + write_audit_findings and marks file-picker/code-searcher discovery-only; docs already matched; dead frontendSection re-export removed + test rewired. snapshot + base2 green.
- M3 (orchestrator family): base-deep now inherits base2's computed spawnable list (no more dropped context-pruner/tmux-cli/browser-use); EXECUTE_PLAN step prompt composes from buildImplementationStepPrompt (editor-handoff guidance restored); M3.2/M3.4 resolved as consistent-by-construction/documented. typecheck + 89 tests green.
- M4 (gate drift guards): gate-paths-parity.test.ts (3 pass) + security-glob-parity.test.ts (4 pass) added.
- M5 (tool hygiene): 4 dead tools (lookup_agent_info, render_ui, find_files, find_files_matching_content) quarantined -> prompt-invisible; tool-reachability broadened to all structured-output agents (caught a latent no-op guard + fixed effective-tool resolution). M5.2 CANCELLED (resolved-by-quarantine; forcing it would break the published/type compatibility contract).
- M6 (discovery boundaries): basher given explicit workspace-write terminal profile; file-lister documented as file-picker's internal worker.
- M7: orchestration/ kept advisory with doc marker.

Only open item: M5.2 needs a user decision if you want to intentionally break the external custom-agent published-tool type contract; otherwise it stays resolved by quarantine. All touched packages typecheck clean; all new + existing targeted tests pass. Awaiting the automated validation/reviewer gate on the changed source files.


<!-- update_plan_status:appended -->
## M3.2 Blocker Resolved + Non-Blocking Cleanup (2026-07) — 2026-07-21T21:49:48.771Z

Reviewer blocker RF-1/RF-2-6e7bf5ad (M3.2 uncertain) resolved: intentional per-mode spawnable deltas documented in base2.ts and test-frozen in roster-drift.test.ts (browser-use unconditional; fast/plan deltas asserted). roster-drift now 7 pass, all typechecks green. M3.2 marked done. Also addressing 2 non-blocking reviewer doc nits (stale frontendSection docstring + mislabeled M3.3->M2.1 milestone comment) in quality-prompt-section.ts since they are the exact stale-reference drift this audit targets.


<!-- update_plan_status:appended -->
## Reviewer Read-Budget Fix Complete (2026-07) — 2026-07-22T03:58:01.890Z

Fixed the reviewer-gate attestation failure at its root: raised MAX_RENDER_CHARS to equal MAX_FILE_BYTES (10MB) in sdk/src/tools/read-files.ts so the byte gate is the single read ceiling. Reviewers (which read only via read_files) can now fully read large files like base2.ts (313 KB) and attest to them. SDK read-files suite 62 pass / 0 fail; SDK typecheck clean. Coupled test expectations updated. Awaiting runtime reviewer gate re-run against the fresh snapshot; the prior did-not-attest-to-base2.ts blocker should now clear because the file renders fully. Open decision still outstanding: M5.2 (whether to genuinely remove read_slices from the published/generated type surface, a compatibility break), left cancelled/quarantined unless user directs otherwise.
