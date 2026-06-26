# Pattern: Audit a codebase (comprehensive, map-reduce)

## When to use
The user asks to "audit", "review", or "find issues across" an entire codebase
(or a large subtree too big to hold in one context). This pattern sharding +
durable scratchpad so findings survive context pruning and shards stay
independent. Do NOT use this for a single-file review or a narrow bug hunt —
use `code-reviewer` directly for those.

## Why this pattern exists
Four bottlenecks make naive audits fail on large codebases:
1. Parent-context synthesis is a single point of failure (pruner eats early
   findings before later files are read).
2. Subagents can't talk sideways (every report relays through the parent).
3. Discovery is fuzzy and sequential (round-trips cost latency + context).
4. "Fully audit" is unstructured (the agent wanders and burns context).

This pattern collapses #1+#2 into **one durable shared scratchpad**, fixes #3
with a **pre-built structural map**, and fixes #4 with an **8-domain
checklist**. Findings live on disk, not in parent context.

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

### Step 1 — Build the structural map (P2)
Run the structural-map builder ONCE for the session:
```bash
bun run scripts/build-structural-map.ts --out .agents/sessions/<slug>/MAP.md
```
Then `read_files` the resulting `MAP.md` and **pin it in your context** — every
shard navigates from it. Do NOT re-discover structure per shard; that's the
bottleneck this kills. If the map already exists for this session, reuse it.

### Step 2 — Shard by top-level directory
From `MAP.md`, partition the codebase into N shards (one per top-level dir, or
finer for huge dirs). Target ~5–15 files per shard so each shard fits in one
subagent context with room to analyze. Group tiny dirs together.

### Step 3 — Spawn shard auditors in parallel
For each shard, spawn a `general-agent` (or `code-reviewer` if the shard is
small) with a prompt containing ONLY:
- The shard's file list (paths).
- The 8 domains above (copy them verbatim).
- The output contract: "Write your findings to
  `.agents/sessions/<slug>/findings/<shard-name>.md` using `write_file`.
  Use this exact format per finding:
  ```
  ## [SEVERITY] domain — file:line — short title
  - **Risk:** one-sentence concrete description of the problem.
  - **Fix:** one-sentence suggested fix.
  - **Evidence:** the exact code snippet or symbol that's wrong.
  ```
  Severity is one of CRITICAL / HIGH / MEDIUM / LOW. Do NOT return findings
  in your message — write them to the file. An empty findings file (just a
  header) means no issues found; that's a valid result."
- Instruction to `read_files` the shard's files, then analyze against all 8
  domains, then `write_file` the findings.

Spawn all shards in ONE `spawn_agents` call so they run concurrently. Each
writes to its own findings file — they never block each other, and the parent
context never holds the raw file contents.

### Step 4 — Synthesize (P1)
After all shards complete, spawn the `synthesizer` agent with a prompt
pointing at the findings directory:
- "Read every file in `.agents/sessions/<slug>/findings/` using `read_files`.
  Produce a single cross-cutting audit report at
  `.agents/sessions/<slug>/AUDIT-REPORT.md` using `write_file`. The report
  must:
  1. De-duplicate findings reported by multiple shards for the same issue.
  2. Group by domain, then sort by severity within each domain.
  3. Add a **Cross-cutting findings** section for issues that span multiple
     shards (these are usually the highest-impact: they indicate a systemic
     pattern, not a one-off bug).
  4. Add a **Top 10** summary at the top with the highest-leverage fixes.
  5. End with a **Coverage** section listing which shards/files were audited
     and which (if any) were skipped, so the user knows the audit's scope."

The synthesizer reads ONLY the small, focused finding files — never the raw
source. This is what keeps the parent context from being the bottleneck.

### Step 5 — Report to the user
`read_files` the final `AUDIT-REPORT.md` and present the Top 10 + a pointer to
the full report. Offer to fix specific findings as a follow-up.

## Conventions
- The session slug goes under `.agents/sessions/<slug>/`. Use a date-stamped
  slug like `audit-<repo>-YYYY-MM`.
- Finding files are named `<shard-name>.md` (kebab-case) under `findings/`.
- Severity ordering is CRITICAL > HIGH > MEDIUM > LOW. When in doubt, downgrade
  — false positives erode trust in the report.
- A shard that finds nothing MUST still write a file with a header and
  "No issues found across all 8 domains." so the synthesizer knows it ran.

## Risks
- **Shards too large** — if a shard's file list exceeds ~3k LOC, the auditor
  will prune and miss things. Split it. The map's per-file LOC counts help
  you size shards.
- **Shards too small** — spawning 50 single-file shards wastes overhead and
  the synthesizer drowns in tiny files. Aim for 5–15 files per shard.
- **Skipping the map** — tempting for "quick" audits, but per-shard discovery
  reintroduces bottleneck #3. Always build the map first for large scopes.
- **Findings in messages instead of files** — if a shard returns findings in
  its `set_output` message instead of writing to the findings file, those
  findings are lost to the pruner. The shard prompt must insist on `write_file`.
- **Synthesizer reading source** — if the synthesizer starts reading raw
  source files, it re-introduces bottleneck #1. It must read ONLY finding
  files. If a finding is unclear, it should flag it, not re-audit.
