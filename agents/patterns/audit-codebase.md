# Pattern: Audit a codebase (comprehensive, map-reduce)

## When to use

The user asks to "audit", "review", or "find issues across" an entire codebase
(or a large subtree too big to hold in one context). This pattern uses sharding +
a durable scratchpad so findings survive context pruning and shards stay
independent. Do NOT use this for a single-file review or a narrow bug hunt —
use `code-reviewer` directly for those.

## Why this pattern exists

Four bottlenecks make naive audits fail on large codebases:

1. Parent-context synthesis is a single point of failure (pruner eats early
   findings before later files are read).
2. Subagents can't talk sideways (every report relays through the parent).
3. Discovery is fuzzy and sequential (round-trips cost latency + context).
4. "Fully audit" is unstructured (the agent wanders and burns context).

This pattern uses runtime-native, snapshot-bound structural and feature
inventories. Markdown reports are optional renderings; they are not the
control plane, so the audit remains usable when `.agents/` is read-only.

Every broad audit also evaluates **feature completeness**: entrypoint,
implementation, consumer wiring, tests, documentation, and observable failure,
loading, empty, cancellation, retry, and permission states.

## The 8 audit domains (the checklist)

Every shard must evaluate its assigned files against ALL eight domains. A
finding is only valid if it names the domain, the file:line, the concrete
risk, and a suggested fix.

1. **Security** — injection, authn/authz bypass, secret leakage, path
   traversal, unsafe deserialization, SSRF, missing input validation,
   over-permissive CORS/cookies, prompt injection surfaces.
2. **Correctness** — logic errors, off-by-one, wrong operator, race
   conditions, incorrect error propagation, broken invariants, misused APIs,
   type assertions that hide bugs.
3. **State mutation** — unguarded shared mutable state, stale closures,
   missing transaction boundaries, cache-invalidation gaps, leaked
   background jobs/AbortSignals, double-frees, order-of-init bugs.
4. **Error handling** — swallowed errors, `catch {}` that hides failures,
   missing retries where required, retries without backoff, error messages
   that leak internals, unhandled promise rejections, missing timeout on I/O.
5. **Performance** — O(n^2) in a hot path, unnecessary clones, serial I/O
   that could be parallel, missing pagination, unbounded memory growth,
   redundant re-renders, N+1 queries.
6. **Dependency hygiene** — pinned vs floating versions, unused deps, dup
   deps, known-vulnerable versions, deps used without being declared, dev
   deps shipped to runtime.
7. **Test coverage gaps** — critical paths with no test, tests that don't
   assert the failure mode, flaky-test patterns, missing error-path tests,
   tests that mock too much to be meaningful.
8. **API/ABI contract breaks** — exported signature changes, removed
   exports, changed error shapes, breaking config/schema changes, changed
   CLI flags/env vars, changed event payloads.

## The flow (map-reduce with a scratchpad)

### Step 0 — Decide if a full audit is warranted

- If the target is < ~30 files OR < ~3k LOC, skip this pattern. Just read the
  files and use `code-reviewer` directly. This pattern's overhead isn't worth
  it for small scopes.
- If the target is large, proceed.

**Breadth check (M10.1):** Before committing to the full audit flow, classify
the request's breadth using `classifyBreadth(prompt)` from
`evals/buffbench/plan-sharding-signals.ts`. A `broad-audit` verdict (>=3
distinct subsystems OR a breadth marker like "whole codebase", AND no
single-file target) confirms the full map-reduce flow. A `single-target`
verdict means skip this pattern and use `code-reviewer` directly on that
file. `unclear` prompts default to the <30-files / <3k-LOC heuristic above.

### Step 1 — Build the native structural inventory

Call `inspect_codebase_structure` once for the audit scope and retain its
`snapshotId`. Its subsystems, entrypoints, routes, commands, public APIs,
tests, manifests, generated sources, and language/framework capability packet
are authoritative for shard allocation.

The legacy Markdown renderer remains available for humans:

```bash
bun run scripts/build-structural-map.ts --out .agents/sessions/<slug>/MAP.md
```

Do not require this script for CLI correctness. It renders the native
inventory plus index detail and may be skipped when the output directory is
unwritable. In plan mode, skip the renderer entirely: the plan-only Basher is
read-only and must not create `MAP.md`; use the native inventory plus
`list_directory`, `glob`, and `query_index` instead.

**Don't blindly rebuild if the map already exists.** The script has a
non-destructive pre-flight that parses the existing map's `Built at:` timestamp
and exits 0 (fresh) or 1 (stale/missing) without touching it:

```bash
bun run scripts/build-structural-map.ts --out .agents/sessions/<slug>/MAP.md --check-stale
```

Use this before pinning. Exit 0 → reuse as-is. Exit 1 → rebuild (re-run
without `--check-stale`). See the **Structural map lifecycle** section below
for the full decision tree.

### Step 2 — Inventory features and shard vertically

Derive feature candidates from the request, docs, command/route/public-API
entries, configuration examples, and tests. Call
`inspect_feature_completeness` for each candidate. Primary shards follow a
feature vertically from its entrypoint through implementation and consumers to
tests, docs, and failure states. Secondary shards cover packages and
cross-cutting domains. Pass the detected capability packet to the default
editor/reviewer rather than creating a language-specific agent.

**Minimum-shard rule (M10.2, SPEC R10.2):** For a `broad-audit` request
(detected by `classifyBreadth` in `evals/buffbench/plan-sharding-signals.ts`),
you MUST spawn at least `max(domainCount, 5)` shard **pairs** — never fewer
than 5, even if fewer domains were enumerated. A "pair" = one `file-picker`
subagent (discovers files) + one `code-searcher` subagent (finds patterns); a
shard with only one type does not count toward the minimum. This rule is
machine-checked by the pure function `evaluateMinimumShardRule`, which is wired
into `evaluateShardingVerdict` as an additional gate: a `broad-audit` trace
that shards but falls short of the minimum-pair bar fails with a clear reason.
For non-`broad-audit` breadth (`single-target` / `unclear`) the rule is
skipped — only apply it when the breadth check returns `broad-audit`.

### Step 3 — Spawn shard auditors in parallel

For each shard, spawn a `general-agent` with unique `params.sessionSlug` and
`params.shardId`, plus a prompt containing ONLY:

- The shard's file list (paths).
- The 8 domains above (copy them verbatim).
- The output contract: "Call `write_audit_findings` exactly once with every
  structured finding and the complete subsystem/feature/file coverage receipt.
  Then return only the tool's compact receipt: artifact path, counts, and hash.
  Do not repeat findings in your response."
- Instruction to `read_files` the shard's files, then analyze against all 8
  domains, then persist the structured findings.

Spawn shards in bounded `spawn_agents` waves of at most the tool's advertised
batch limit. Run each wave concurrently, join it, record its findings, then
launch another wave whenever the coverage check still has gaps. The batch
limit is a concurrency bound, not a total-agent limit. Each shard can write
only to `.agents/sessions/<slug>/findings/<shard-id>.md`; the runtime derives
that path, validates the structured payload, and creates it exclusively. The
parent receives only compact receipts, so raw findings never occupy its
context.

**Pair composition (M10.2):** Each shard pair MUST include both a
`file-picker` (discovers the shard's files) and a `code-searcher` (finds
patterns across them). A shard that runs only a `file-picker` or only a
`code-searcher` does **not** count toward the minimum-shard floor — the
minimum is measured in complete pairs (`min(file-picker, code-searcher)`), not
raw subagent count. So a trace with 10 `file-picker`s and 0 `code-searcher`s
has 0 pairs and fails the rule.

### Step 3.5 — Machine-check the coverage matrix

Before synthesizing, call `evaluate_audit_coverage` with the exact inventory
snapshot, structural receipts, feature list, and explicit out-of-scope reasons.
An incomplete result blocks synthesis. Render the matrix in the durable
session `STATUS.md`; it is only a rendering of the runtime result. Format:

```
# Coverage matrix

| Domain | Shard IDs | Covered |
|--------|-----------|--------|
| agents | shard-0, shard-1 | yes |
| sdk    | shard-2    | yes |
| cli    |            | NO    |
```

List EVERY enumerated domain. Domains with no shard assigned are marked `NO` —
these are silent under-coverage gaps. If any domain is uncovered, either
re-shard to cover it or explicitly mark it out-of-scope in the matrix. This
prevents the "you didn't look at X" complaint by making gaps visible before
synthesis.

### Step 3.6 — Subsystem-enumeration guard (M10.4, SPEC R10.4)

Enumerate the repo's top-level directories (from `MAP.md` or `list_directory`
of the project root). For EACH top-level dir, confirm one of:

- **audited** — it was sharded (appears in the coverage matrix with >=1 shard).
- **out-of-scope** — explicitly marked with a one-line reason (e.g. "docs:
  out-of-scope (not code)", ".agents: out-of-scope (session artifacts)").

Append a `## Subsystem enumeration` section to `STATUS.md` listing
every top-level dir with its disposition. If any dir is missing BOTH a shard
AND an out-of-scope mark, the audit is incomplete — the planner must either
shard it or mark it out-of-scope before synthesizing. This is the direct fix
for the user's "you didn't look at X" complaint.

### Step 4 — Synthesize (P1)

After all shards complete, spawn the `synthesizer` agent with a prompt
pointing at the findings directory and report path:

- "Read every Markdown file under
  `.agents/sessions/<slug>/findings/` using `read_files`. Produce a single
  cross-cutting report at `.agents/sessions/<slug>/AUDIT-REPORT.md`. The report
  must:
  1. De-duplicate findings reported by multiple shards for the same issue.
  2. Group by domain, then sort by severity within each domain.
  3. Add a **Cross-cutting findings** section for issues that span multiple
     shards (these are usually the highest-impact: they indicate a systemic
     pattern, not a one-off bug).
  4. Add a **Top 10** summary at the top with the highest-leverage fixes.
  5. End with a **Coverage** section that references the STATUS matrix
     and lists which shards/files were audited and which (if any) were
     skipped or marked out-of-scope, so the user knows the audit's scope."

The synthesizer reads ONLY the durable finding files — never raw source. The
parent receives only the synthesizer's compact report receipt, then folds the
priorities into `SPEC.md` / `PLAN.md` and updates the resume checkpoint.

### Step 5 — Report to the user

Present the synthesized Top 10 and point to the durable session artifacts.
Offer to fix specific findings as a follow-up.

## Structural map lifecycle (auto-rebuild)

This section applies only when a non-plan workflow explicitly opts into the
legacy human-readable renderer. Plan mode uses the native snapshot and does
not create or refresh `MAP.md` through Basher.

The map is a timestamped snapshot, not a live view. The script embeds a
`Built at: <ISO>` line at the top so staleness is machine-readable. The
`--check-stale` pre-flight parses that line so you don't have to.

**Before pinning the map, run this exact sequence once at session start and
again at the top of any later work block:**

```bash
bun run scripts/build-structural-map.ts --out .agents/sessions/<slug>/MAP.md --check-stale
```

Then:

- **Exit 0 (fresh)** → `read_files` the map and pin it. Skip the rebuild.
- **Exit 1 (stale/missing)** → rebuild, then `read_files`:
  ```bash
  bun run scripts/build-structural-map.ts --out .agents/sessions/<slug>/MAP.md
  ```
- **Exit 2 (unparseable)** → the map is corrupted/edited by hand. Rebuild.

**Default staleness threshold is 30 minutes.** Tune it per session:

- Read-only audit of a static tree → `--max-age-minutes 120` (a stale map is
  fine; avoid blocking the indexer).
- Active-editing session where you're fixing findings as you find them →
  `--max-age-minutes 10` (re-orient against the real layout before each
  synthesis wave).
- Long session (>2h) → re-run the pre-flight at the top of each new work
  block, not just once at start. A 2h-old map can mislead.

**Do not** rebuild on every shard — that defeats the point (one render, many
reads). Only the parent orchestrator rebuilds; shards read the pinned map.

## Conventions

- The session slug goes under `.agents/sessions/<slug>/`. Use a date-stamped
  slug like `audit-<repo>-YYYY-MM`.
- Severity ordering is CRITICAL > HIGH > MEDIUM > LOW. When in doubt, downgrade
  — false positives erode trust in the report.
- A shard that finds nothing MUST still call `write_audit_findings` with
  `noIssuesFound: true`, an empty findings array, and its full coverage receipt.

## Risks

- **Shards too large** — if a shard's file list exceeds ~3k LOC, the auditor
  will prune and miss things. Split it. The map's per-file LOC counts help
  you size shards.
- **Shards too small** — spawning 50 single-file shards wastes overhead and
  the synthesizer drowns in tiny files. Aim for 5–15 files per shard.
- **Skipping the map** — tempting for "quick" audits, but per-shard discovery
  reintroduces bottleneck #3. Always build the map first for large scopes.
- **Unpersisted findings** — a shard is incomplete until
  `write_audit_findings` returns an artifact path and hash. Do not accept raw
  prose findings as a substitute.
- **Synthesizer reading source** — if the synthesizer starts reading raw
  source files, it re-introduces bottleneck #1. It must read ONLY finding
  receipts. If a finding is unclear, it should flag it, not re-audit.
