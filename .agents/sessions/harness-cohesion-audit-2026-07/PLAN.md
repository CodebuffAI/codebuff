# PLAN — Harness Cohesion Remediation
<!-- current-task: none -->

Milestones are ordered by risk/leverage. Each executable task has a stable ID, dependencies, acceptance, and validation. Do the roster + prompt-mismatch milestones first (highest cohesion payoff, lowest blast radius), gate/tool hygiene next, orchestration-duality decision last.

Validation routing (per AGENTS.md path→suite map):
- `agents/*` → agents typecheck + relevant `agents/__tests__/*` and e2e
- `common/*` → common checks + dependent package typechecks
- `packages/agent-runtime/*` → runtime typecheck/tests
- `cli/*` → CLI typecheck (+ visual smoke if components)

---

## M1 — Single source of truth for the agent roster

- [x] M1.1 Inventory + classify every id referenced across the 5 rosters (Inventory matrix recorded in STATUS.md; analysis-only task.)
  - Acceptance: a checked-in matrix (this session) listing each id × {shipped-bundled, spawnable, routed, persona, external-cli-allowlisted, dead}
  - Validate: n/a (analysis)
- [x] M1.2 Reconcile `common/src/constants/agents.ts` (`AGENT_PERSONAS`/`AGENT_IDS`) (Claimed: reconcile AGENT_PERSONAS/AGENT_IDS against bundled roster.)
  - Depends on: M1.1
  - Acceptance: remove non-shipped ids (`ask`, `planner`, `agent-builder`, `reviewer`, `file-explorer`, `researcher`); add missing shipped ids OR derive the map from bundled agents; no runtime consumer breaks
  - Validate: `bun test` common + `cli` typecheck
- [x] M1.3 Prune dead ids from `openbuff.d.example/routes.json` or allowlist external CLI agents explicitly (routes.json pruned to shipped/bundled + external-CLI/eval allowlist; 0 dead ids verified.)
  - Depends on: M1.1
  - Acceptance: every routes.json id is shipped/bundled or in a documented external-CLI allowlist
  - Validate: new guard test (M1.4)
- [x] M1.4 Add a roster-drift guard test (Building roster-drift guard test.) (roster-drift guard test created + green (4 pass). Validates the whole M1 milestone.)
  - Depends on: M1.2, M1.3
  - Acceptance: test fails if a persona/routes/spawnable id is neither bundled nor allowlisted, AND if a bundled non-root agent is unreachable by any orchestrator or pattern
  - Validate: `bun test agents/__tests__/` (new test file)
- [x] M1.5 Resolve `directory-lister` / `glob-matcher` reachability (directory-lister/glob-matcher reachability.) (Decision recorded: directory-lister/glob-matcher stay bundled, intentionally excluded from orchestrator spawnability; guard encodes intentionallyExcluded. M1 milestone complete.)
  - Depends on: M1.4
  - Acceptance: either added to an orchestrator/pattern spawnable path or removed from bundling; guard from M1.4 passes
  - Validate: `bun test agents/__tests__/`

## M2 — Prompt ↔ capability alignment (core cohesion fix)

- [x] M2.1 Fix `buildBroadAuditSection` shard→receipt path (Claiming: fix buildBroadAuditSection shard->receipt path.) (buildBroadAuditSection produce/consume path fixed; snapshot + base2 tests green.)
  - Acceptance: the section routes audit/reasoning shards that must emit `structuralReceipt` to `general-agent` + `write_audit_findings` (not file-picker/code-searcher); discovery-only shards are named as discovery-only; produce-path and consume-path (`evaluate_audit_coverage`) connect
  - Validate: `bun test agents/__tests__/quality-prompt-snapshot.test.ts` (update snapshot intentionally) + `agents/__tests__/base2.test.ts`
- [x] M2.2 Surface the durable-findings / synthesizer flow in orchestrator guidance (Surface durable-findings/synthesizer flow in orchestrator guidance + docs.) (Doc and prompt agree on general-agent + write_audit_findings + synthesizer audit flow. No doc edit needed (docs already correct at lines 24, 84, 951-962).)
  - Depends on: M2.1
  - Acceptance: `buildBroadAuditSection` (or a sibling) tells the coordinator to spawn `general-agent` audit shards with `sessionSlug`/`shardId`/`snapshotId` and to reduce via `synthesizer`; `docs/agents-and-tools.md` matches
  - Validate: snapshot test + doc read-back
- [x] M2.3 Remove the production-dead `frontendSection` re-export (Claiming: remove production-dead frontendSection re-export or rewire snapshot test to canonical prompt-sections.ts.) (frontendSection dead re-export removed; test rewired to canonical source; snapshot + typecheck green.)
  - Acceptance: `quality-prompt-section.ts:77` re-export removed OR snapshot test rewired to import from the canonical `prompt-sections.ts`; production path unchanged
  - Validate: `bun test agents/__tests__/quality-prompt-snapshot.test.ts`

## M3 — Orchestrator family consistency

- [x] M3.1 Reconcile `base-deep` spawnable list with `base2` (Claiming: reconcile base-deep spawnable list with base2.) (base-deep override removed; inherits base2 computed list. Also resolves the base-deep half of M3.2.) (Verified: browser-use is unconditional across all modes incl. fast; per-mode deltas are only the coded planOnly/isDefault/isFast gates, now guarded by roster-drift + specialists tests. No code change needed.) (Documented intentional per-mode spawnable deltas in base2.ts + test-asserted delta block in roster-drift.test.ts. Reviewer blocker RF-1/RF-2 resolved. roster-drift 7 pass, typechecks green.)
  - Depends on: M1.4
  - Acceptance: base-deep no longer silently drops `context-pruner`/`tmux-cli` (or the deltas are intentional + documented + test-asserted); prefer generating base-deep's list from the same computed source as base2
  - Validate: `bun test agents/__tests__/base2.test.ts` + new consistency assertion
- [x] M3.2 Align `base2-fast` spawnable set (browser-use) with the other modes (Documented intentional per-mode deltas in base2.ts and froze them with a roster-drift assertion.) (browser-use is unconditional across default/fast/plan/execute-plan; the only fast delta vs default is the default-only editor family + thinker, and the only plan delta is the implementation-only mutation agents. Documented inline in `agents/base2/base2.ts` above `spawnableAgents` and test-asserted by the new `intentional per-mode spawnable deltas (M3.2)` block in `agents/__tests__/roster-drift.test.ts`.)
  - Depends on: M3.1
  - Acceptance: intentional per-mode deltas only; documented
  - Validate: `bun test agents/__tests__/`
- [x] M3.3 Share editor-handoff guidance between DEFAULT and EXECUTE_PLAN step prompts (Share editor-handoff guidance between DEFAULT and EXECUTE_PLAN step prompts.) (buildExecutePlanStepPrompt composes buildImplementationStepPrompt; EXECUTE_PLAN now carries editor-handoff guidance. Gate green.)
  - Acceptance: `buildExecutePlanStepPrompt` carries the same editor-handoff / "don't manually spawn code-reviewer" guidance as `buildImplementationStepPrompt`; PLAN builder composes from shared builders instead of reimplementing
  - Validate: snapshot + `agents/__tests__/base2.test.ts`
- [x] M3.4 Make `gateAwarenessSection` gating consistent across base2/base-deep (Claiming: make gateAwarenessSection gating consistent across base2/base-deep.) (gateAwarenessSection gating rule documented; equivalent behavior confirmed, no code change needed.)
  - Depends on: M3.1
  - Acceptance: one documented rule for when the section is included (both conditional or both unconditional with justification)
  - Validate: snapshot test

## M4 — Gate / reviewer drift guards

- [x] M4.1 Add aux-path parity test for `gate-paths.ts` helpers (Claiming: add aux-path parity test for gate-paths.ts helpers.) (gate-paths parity test added and green (3 pass).)
  - Acceptance: `gate-aux-triggers.test.ts` (or new file) asserts inline `normalizeGateFilePath`/`normalizeGateFileList`/`gateFileSetsEqual` equal the `gate-paths.ts` exports, matching the existing gate-repair/gate-reviewer parity pattern
  - Validate: `bun test agents/__tests__/gate-aux-triggers.test.ts`
- [x] M4.2 Single frozen source for the security-sensitive glob list (Single frozen source + parity test for the security-sensitive glob list.) (security-glob-parity guard green (4 pass).)
  - Acceptance: inline gate predicate and `securityReviewSection` derive from / are parity-tested against one list
  - Validate: `bun test agents/__tests__/`

## M5 — Tool registry hygiene

- [x] M5.1 Resolve the 4 dead tools (`lookup_agent_info`, `render_ui`, `find_files`, `find_files_matching_content`) (Resolve 4 dead tools: lookup_agent_info, render_ui, find_files, find_files_matching_content.) (4 dead tools quarantined; gate green.)
  - Acceptance: each is either granted to an agent that should have it, or set non-promptVisible/quarantined, with a rationale; no dangling promptVisible-but-ungranted tools
  - Validate: `bun test agents/tool-reachability.test.ts` + `common/src/tools/__tests__/`
- [/] M5.2 Remove `read_slices` from published/generated type surface (Remove read_slices from publishedTools + regenerated agents/types/tools.ts.) (Conflicts with test-encoded compatibility invariants; read_slices already prompt-invisible via quarantine. Awaiting user decision — see STATUS.) (CANCELLED (resolved-by-quarantine). Removing read_slices from publishedTools + generated types would break two deliberate compatibility invariants (quarantined-tools-stay-published; generated-types-include-every-published-tool) and change the external custom-agent type contract. read_slices is already prompt-invisible via M5.1 quarantine metadata, which achieves the real goal. Reopen only if intentionally breaking the published/type compatibility contract.)
  - Acceptance: `read_slices` out of `publishedTools` and regenerated `agents/types/tools.ts`; quarantine metadata unchanged
  - Validate: `bun test common/src/tools/__tests__/` + regenerate tool defs
- [x] M5.3 Broaden `tool-reachability.test.ts` to enumerate all structured-output agents (Claiming: broaden tool-reachability set_output coverage to all structured-output agents.) (Broadened + fixed structured-output guard; 11 pass.)
  - Depends on: M5.1
  - Acceptance: test covers every structured-output agent's auto-injected `set_output`
  - Validate: `bun test agents/tool-reachability.test.ts`

## M6 — Discovery agent boundaries

- [x] M6.1 Give `basher` an explicit terminal permission profile (Give basher an explicit terminalPermissionProfile.) (basher terminalPermissionProfile made explicit (workspace-write); gate green.)
  - Acceptance: basher declares a profile consistent with debugger/git-committer/etc.; no capability regression
  - Validate: `bun test agents/__tests__/basher.test.ts` + spawn-permissions runtime tests
- [x] M6.2 Clarify `file-picker` / `file-lister` boundary (Clarify file-picker/file-lister boundary.) (file-lister documented as file-picker internal worker; tests green.)
  - Acceptance: file-lister documented as file-picker's internal worker (or merged); no orphan spawnerPrompt confusion
  - Validate: `bun test agents/__tests__/file-picker.test.ts` + `file-lister.test.ts`

## M7 — Orchestration subsystem decision

- [x] M7.1 Decide fate of `packages/agent-runtime/src/orchestration/*` (Deciding fate of packages/agent-runtime/src/orchestration/*.) (orchestration/ kept advisory/telemetry with doc marker in workflow-engine.ts; runtime typecheck green.)
  - Acceptance: a documented decision (keep-as-telemetry / remove `workflow-engine` / promote to authoritative); if kept, a doc note marks it advisory so it is not mistaken for the authoritative gate
  - Validate: runtime typecheck/tests if code changes; else doc-only

---

## Risks / Blockers / Open Questions

- **Snapshot churn:** `quality-prompt-snapshot.test.ts` byte-freezes shared prompt text; M2/M3 edits require deliberate snapshot updates. Do not blind-update — confirm the diff is the intended change.
- **Generated artifacts:** `bundled-agents.generated.ts` and `agents/types/tools.ts` are generated; edit the source + regenerate, never hand-edit.
- **Open question (needs user):** Should `AGENT_PERSONAS`/`AGENT_IDS` be fully derived from bundled agents (bigger refactor) or reconciled + drift-guarded (smaller)? Default assumption: reconcile + guard.
- **Open question (needs user):** For `orchestration/`, is `workflow-engine` intended future work or removable? Default assumption: keep, mark advisory.
- **base-deep list generation** may reduce flexibility if some deltas are intentional; confirm intended deltas before collapsing to a generated list.

## Validation Gates (per milestone)

- M1: new roster-drift guard test green; common + cli typecheck green.
- M2/M3: intentional snapshot update + `agents/__tests__/base2.test.ts` green.
- M4: new parity tests green.
- M5: tool-reachability + tool metadata tests green; tool defs regenerated.
- M6: agent + spawn-permission tests green.
- M7: decision recorded; typecheck green if code touched.

## Checkpoint / Update Rules

- Update STATUS.md via `update_plan_status` at each task start/finish, blocker discovery/resolution, and validation result.
- Append to LESSONS.md via `update_plan_status` whenever a snapshot/generated-artifact gotcha or an intentional-delta decision is confirmed.
- Use `create_plan` only to rewrite SPEC.md/PLAN.md if scope materially changes.
