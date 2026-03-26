# Evalbuff

Evalbuff is an automated system that iteratively improves a coding agent's performance by optimizing project documentation. It runs overnight, discovers what an agent gets wrong, writes docs to fix those gaps, and keeps only the changes that measurably improve scores.

## The Idea

Most coding agents read project documentation before making changes. Better docs lead to better code. But writing good docs is hard — you don't know what an agent needs to know until you watch it fail.

Evalbuff closes this loop automatically:

1. **Run** a coding agent on real eval tasks (reconstructing git commits)
2. **Judge** the output with AI judges that apply living quality criteria
3. **Analyze** failures — feed the judge's weaknesses to a doc-writer agent
4. **Test** whether a proposed doc edit actually improves the agent's score
5. **Keep** doc changes that help, revert ones that don't
6. **Repeat** until the budget runs out or scores plateau

The result: a `docs/` directory and `AGENTS.md` table of contents that encode exactly what the agent needs to know to perform well on your codebase. Any agent that reads project docs benefits — Claude Code, Codex, Codebuff, or anything else with a CLI.

## Why Documentation?

We chose documentation as the improvement lever because:

- **Agent-agnostic.** Every modern coding agent reads project docs. Improving docs improves all agents, not just one.
- **Interpretable.** Unlike fine-tuning weights or tweaking system prompts, docs are human-readable. You can review what evalbuff learned and decide if it makes sense.
- **Composable.** Doc improvements stack. A doc about error handling patterns doesn't conflict with a doc about naming conventions.
- **Persistent.** Docs live in the repo and benefit every future session, not just the current one.

## Living Quality Criteria

Evalbuff uses a leveling system so it doesn't try to optimize everything at once:

| Level | Criteria Added | When |
|-------|---------------|------|
| L1 | Correctness, Completeness, Basic Style | Start |
| L2 | + Pattern Consistency | After L1 avg >= 8.0 over 10 tasks |
| L3 | + Test Quality | After L2 avg >= 8.0 over 10 tasks |
| L4 | + Optimal Design | After L3 avg >= 8.0 over 10 tasks |
| L5 | + Fluency | After L4 avg >= 8.0 over 10 tasks |

This prevents the system from penalizing an agent for style issues when it can't even get the code to compile. Criteria are injected directly into the AI judge prompts.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   Orchestrator                       │
│                 (run-evalbuff.ts)                    │
│                                                     │
│  for each eval task:                                │
│    1. Clone repo into isolated temp dir             │
│    2. Copy current docs/ into the clone             │
│    3. Run agent CLI on the task prompt              │
│    4. Judge the diff against ground truth           │
│    5. If score < threshold:                         │
│       a. Analyze failure → propose doc edit         │
│       b. Re-run agent with new doc                  │
│       c. Re-judge → keep doc if score improved      │
│    6. Update criteria level if scores are high      │
│    7. Log entry to JSONL, save state                │
│                                                     │
│  Generate morning report                            │
└─────────────────────────────────────────────────────┘
```

### Components

| File | Role |
|------|------|
| `run-evalbuff.ts` | Main orchestrator loop with budget caps and resumable state |
| `cli-runner.ts` | Agent-agnostic CLI runner — spawns any agent command, captures git diff |
| `judge.ts` | AI judging system (GPT-5.1 + Gemini) with criteria injection |
| `docs-optimizer.ts` | Failure analysis, doc writing, doc application, score comparison |
| `criteria.ts` | Living quality criteria with L1-L5 promotion logic |
| `morning-report.ts` | Generates markdown summary from overnight JSONL log |
| `test-repo-utils.ts` | Creates isolated git repos per eval task |
| `agent-runner.ts` | BuffBench-style agent runner (for Codebuff SDK agents) |
| `types.ts` | Shared types (EvalCommitV2, EvalDataV2, etc.) |

## Usage

### Command Line

```bash
bun run evalbuff/src/run-evalbuff.ts \
  --repo /path/to/target-repo \
  --agent "claude -p" \
  --evals evals/buffbench/eval-codebuff.json,evals/buffbench/eval-manifold.json \
  --max-iterations 50 \
  --max-cost 50 \
  --score-threshold 7.0 \
  --agent-timeout 300000
```

Or via the workspace script:

```bash
bun run --filter @codebuff/evalbuff run -- \
  --repo /path/to/target-repo \
  --agent "codex exec --full-auto" \
  --evals evals/buffbench/eval-codebuff.json
```

### Arguments

| Argument | Default | Description |
|----------|---------|-------------|
| `--repo` | required | Path to the target repo where docs/ will be written |
| `--agent` | required | Agent CLI command (prompt is appended as last arg) |
| `--evals` | required | Comma-separated paths to eval JSON files |
| `--max-iterations` | 50 | Stop after this many tasks |
| `--max-cost` | 50 | Stop after spending this many USD (estimated) |
| `--score-threshold` | 7.0 | Only attempt doc edits for scores below this |
| `--agent-timeout` | 300000 | Per-task agent timeout in ms (5 min default) |
| `--criteria` | auto | Path to criteria JSON (auto-created if omitted) |

### Overnight Run

For an overnight run, set generous limits and let it go:

```bash
nohup bun run evalbuff/src/run-evalbuff.ts \
  --repo /path/to/repo \
  --agent "claude -p" \
  --evals evals/buffbench/eval-codebuff.json \
  --max-iterations 200 \
  --max-cost 100 \
  > evalbuff-overnight.log 2>&1 &
```

Check results in the morning:
- `<repo>/evalbuff-report-YYYY-MM-DD.md` — morning report
- `<repo>/evalbuff-log.jsonl` — detailed per-task log
- `<repo>/docs/` — the docs that were kept
- `<repo>/AGENTS.md` — table of contents

### Resumable

Evalbuff saves state to `evalbuff-state.json` in the target repo. If interrupted, re-running with the same arguments will skip completed tasks and continue where it left off.

## How It Decides What Docs to Write

When an agent scores below the threshold on a task, evalbuff:

1. **Feeds the judge's weaknesses** to a doc-writer LLM agent
2. The doc writer sees: the task prompt, ground truth diff, agent's diff, judge analysis, and all current docs
3. It produces a **targeted doc file** — specific to the gap between what the agent did and what it should have done
4. The doc is written to `docs/<suggested-path>.md` and `AGENTS.md` is updated

The doc writer is instructed to be specific and actionable — referencing concrete file paths, function names, and patterns. Generic advice like "follow best practices" is explicitly rejected.

## What Gets Produced

After a run, the target repo will contain:

```
target-repo/
├── docs/
│   ├── patterns/
│   │   └── error-handling.md      # Evalbuff-generated
│   ├── conventions/
│   │   └── naming.md              # Evalbuff-generated
│   └── architecture/
│       └── data-flow.md           # Evalbuff-generated
├── AGENTS.md                       # Table of contents
├── evalbuff-state.json            # Resumable state
├── evalbuff-log.jsonl             # Per-task log
├── evalbuff-criteria.json         # Current criteria level
└── evalbuff-report-2026-03-25.md  # Morning report
```

### Morning Report

The morning report includes:
- Summary table (iterations, cost, duration, score deltas)
- Doc changes table (which docs were tried, score impact, kept/reverted)
- Error log
- Score trajectory visualization

## Eval Data Format

Evalbuff reuses BuffBench's `EvalDataV2` format. Eval tasks are real git commits from open source repos, turned into prompts:

```json
{
  "repoUrl": "https://github.com/org/repo",
  "evalCommits": [
    {
      "id": "task-abc123",
      "sha": "abc123",
      "parentSha": "def456",
      "prompt": "Add error handling to the API endpoint...",
      "fileDiffs": [{ "path": "src/api.ts", "diff": "..." }],
      "supplementalFiles": ["src/types.ts"]
    }
  ]
}
```

Generate new evals with BuffBench's eval generation tools, then point evalbuff at the JSON files.

## Relationship to BuffBench

BuffBench benchmarks agents against each other. Evalbuff improves a single agent's performance over time.

| | BuffBench | Evalbuff |
|---|-----------|----------|
| **Goal** | Compare agents | Improve an agent |
| **Output** | Scores + rankings | Documentation |
| **Loop** | Single pass | Iterative |
| **Judges** | 3 (GPT, Gemini, Claude) | 2 (GPT, Gemini) |
| **Agent coupling** | Codebuff SDK | Any CLI agent |

Evalbuff was deep-copied from BuffBench and modified — they share types and eval data format but are independent codebases.
