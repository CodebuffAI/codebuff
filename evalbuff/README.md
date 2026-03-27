# Evalbuff

Evalbuff improves a coding agent's performance by iteratively optimizing project documentation. It watches an agent fail, writes docs to fix the pattern, and keeps only the changes that measurably help.

## Two Modes

### 1. Commit Learning Mode (default)

Walks through your repo's git history commit-by-commit, using each commit as a learning opportunity:

1. Start at HEAD~500 (configurable) and process commits one at a time, oldest first
2. For each commit, craft a human-like prompt that vaguely describes the change (via LLM)
3. Run N agents in parallel (default 5) on that prompt against the parent commit
4. Judge all runs — using the actual commit diff as ground truth
5. Always analyze failures and propose doc changes (ensuring they're generic enough to help future tasks, not just this one)
6. Re-run N agents with the proposed docs
7. If scores improve, keep the docs and try to propose more improvements
8. If scores don't improve, reject the docs and move to the next commit
9. State is saved after each commit — resume at any time

The result: a `docs/` directory that encodes patterns the agent needs to know, learned from real historical changes.

### 2. Prompt Mode

Run a specific coding prompt and improve docs for it — no git history needed:

1. Given a prompt describing a coding task
2. Run N agents in parallel on the prompt against the current HEAD
3. Judge all runs — no ground truth, relies entirely on e2e testing by the judge
4. Analyze and propose doc changes
5. Re-run and keep/reject as with learn mode

Useful for targeted doc improvement around known pain points.

## How It Works

```
for each task (commit or prompt):
  ┌─────────────────────────────────────────────────────┐
  │  1. Run N agents in parallel (baseline)             │
  │  2. Judge all N runs → average score                │
  │  3. Analyze worst run → propose generic doc         │
  │  4. Apply doc to repo                               │
  │  5. Re-run N agents with new doc                    │
  │  6. Score improved? Keep doc, try more improvements │
  │     Score same/worse? Reject doc, next task         │
  └─────────────────────────────────────────────────────┘
```

Key design decisions:
- **Low-cost agent** (`codebuff --agent base2-free` by default) — runs many times cheaply
- **N parallel runs** for statistical significance — one run is noisy, five gives a decent signal
- **Always analyze** — no score threshold; every task is a learning opportunity
- **Generic docs only** — the doc writer is instructed to skip task-specific advice and focus on patterns
- **Iterative improvement** — keeps proposing docs until one is rejected, then moves on

## Usage

### Commit Learning Mode

```bash
bun run evalbuff/src/run-evalbuff.ts \
  --repo /path/to/target-repo \
  --agent "codebuff --agent base2-free" \
  --commits 500 \
  --parallelism 5 \
  --max-cost 100
```

### Prompt Mode

```bash
bun run evalbuff/src/run-evalbuff.ts \
  --repo /path/to/target-repo \
  --agent "codebuff --agent base2-free" \
  --prompt "Add a dark mode toggle to the settings page" \
  --parallelism 5
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--repo` | required | Path to the target repo where docs/ will be written |
| `--agent` | `codebuff --agent base2-free` | Agent CLI command (prompt appended as last arg) |
| `--prompt` | — | If set, runs in prompt mode instead of learn mode |
| `--commits` | 500 | How many commits back to start from (learn mode) |
| `--parallelism` | 5 | Number of agents to run in parallel per task |
| `--max-cost` | 100 | Stop after spending this many USD (estimated) |
| `--agent-timeout` | 300000 | Per-agent timeout in ms (5 min default) |
| `--init-command` | — | Command to run in each test repo (e.g., `npm install`) |
| `--criteria` | auto | Path to criteria JSON (auto-created if omitted) |
| `--reviewers` | `claude,codex` | Comma-separated reviewer agent types |

### Resuming

State is saved to `evalbuff-state.json` in the target repo after each commit. Re-running with the same `--repo` automatically resumes from where it left off — it knows which commit was last processed and continues from there.

### Overnight Run

```bash
nohup bun run evalbuff/src/run-evalbuff.ts \
  --repo /path/to/repo \
  --commits 500 \
  --parallelism 5 \
  --max-cost 200 \
  > evalbuff-overnight.log 2>&1 &
```

## What Gets Produced

```
target-repo/
├── docs/                              # Generated documentation
│   ├── patterns/
│   │   └── error-handling.md
│   ├── conventions/
│   │   └── naming.md
│   └── architecture/
│       └── data-flow.md
├── AGENTS.md                          # Table of contents
├── evalbuff-state.json               # Resumable state (last commit SHA)
├── evalbuff-log.jsonl                # Per-task log
├── evalbuff-criteria.json            # Current criteria level
└── evalbuff-report-2026-03-26.md     # Report
```

## Living Quality Criteria

Judges use a leveling system to avoid over-optimizing prematurely:

| Level | Criteria Added | Promotion |
|-------|---------------|-----------|
| L1 | Builds, tests pass, basic completeness | Start |
| L2 | + Feature works E2E, logs clean | After L1 avg >= 8.0 over 10 tasks |
| L3 | + Edge cases, UI verification | After L2 avg >= 8.0 |
| L4 | + Cross-component integration, performance | After L3 avg >= 8.0 |
| L5 | + Production readiness | After L4 avg >= 8.0 |

## Architecture

| File | Role |
|------|------|
| `run-evalbuff.ts` | Main orchestrator — learn mode + prompt mode |
| `commit-task-generator.ts` | Extract tasks from git history, generate prompts from commits |
| `cli-runner.ts` | Agent-agnostic CLI runner — spawns any agent, captures diff |
| `judge.ts` | AI judging with/without ground truth, multi-reviewer aggregation |
| `docs-optimizer.ts` | Failure analysis, generic doc writing, doc application/revert |
| `criteria.ts` | Living quality criteria with L1-L5 promotion |
| `morning-report.ts` | Report generation from JSONL log |
| `test-repo-utils.ts` | Isolated git repo lifecycle management |
