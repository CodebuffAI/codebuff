# Evalbuff — Brainstorm

> Generate evals for *your* codebase. Not generic benchmarks — codebase-specific e2e testing, review, and context for AI coding agents.

## What is Evalbuff?

A CLI tool that helps teams build, run, and improve end-to-end evaluations for their codebase. It's intended to be used by:

- **The coding agent** — to check its own changes in a review step
- **CI** — to run core flows and grade output quality
- **The human developer** — to define flows, dump knowledge, and tune evals

Evalbuff is **not a coding agent**. It evaluates, reviews, and provides context. This means it complements any coding agent (Codebuff, Claude Code, Cursor, Copilot, etc.) without competing with them.

## Commands

| Command | Audience | Description |
|---------|----------|-------------|
| `evalbuff` | Human | Fancy TUI for browsing/editing knowledge, evals, and results |
| `evalbuff init` | Human | Initialize evalbuff in a project |
| `evalbuff context <prompt>` | Agent / Human | Return relevant files, knowledge, and gotchas for a prompt |
| `evalbuff review [prompt]` | Agent / CI / Human | Review a change e2e, give rich structured feedback. Optional prompt describes what was requested so the reviewer can verify intent. |
| `evalbuff run [task]` | CI / Human | Run eval tasks and output graded results |
| `evalbuff learn` | CI / Human | Self-improvement: iterate on evals, knowledge, and context quality |
| `evalbuff refresh` | CI (nightly) | Scan recent commits, update knowledge and eval subagents |

## Phase 1 — Context + Review (Immediate Value, Zero Setup)

The `context` and `review` commands are useful on day one with minimal configuration and can be a product in themselves.

### `evalbuff context`

Takes a prompt, returns everything a coding agent needs to work on it:

- **Relevant files** with summaries (leveraging an excellent file picker)
- **Background knowledge** of the systems involved
- **Lessons and gotchas** learned from past work

This is like a dynamic, project-specific skill that's better than any static AGENTS.md. Any coding agent can call this to get oriented before making changes.

### `evalbuff review [prompt]`

Given file diffs, uncommitted changes, or a branch:

- Outputs rich, structured feedback on what went wrong and why
- Feedback is designed to be easy to feed back into a coding agent for a fix
- Can check against project conventions, known patterns, and past mistakes

Both commands naturally build up the `.agents/knowledge/` directory, which makes everything better over time.

### Skill Installation — Teaching the Coding Agent About Evalbuff

For `context` and `review` to be useful to coding agents, the agent needs to *know* they exist and how to call them. Evalbuff solves this by installing a skill into the user's project.

`evalbuff init` (or a dedicated `evalbuff install-skill`) writes a `SKILL.md` file into both:

- `.agents/skills/evalbuff/SKILL.md` — for Codebuff and SDK-based agents
- `.claude/skills/evalbuff/SKILL.md` — for Claude Code compatibility

The skill teaches the coding agent:

- **When to call `evalbuff context <prompt>`** — at the start of a task, to get relevant files, background knowledge, and gotchas before making changes
- **When to call `evalbuff review`** — after making changes, to get structured feedback before committing
- **Expected output format** — so the agent knows how to parse and act on the results
- **How to feed review feedback back** — close the loop by using review output to fix issues

This is the critical glue that makes evalbuff work with *any* coding agent that supports skills (Codebuff, Claude Code, and anything built on the Codebuff SDK). The skill acts as a lightweight integration layer — no plugin system, no API integration, just a markdown file that the agent reads.

Example skill content (draft):

```markdown
---
name: evalbuff
description: Use evalbuff to get project context before coding and review changes before committing
---

# Evalbuff

This project uses evalbuff for context gathering and change review.

## Before starting a task

Run `evalbuff context "<description of what you're about to do>"` to get:
- Relevant files you should read
- Background knowledge about the systems involved  
- Known gotchas and lessons from past work

## After making changes

Run `evalbuff review "<what the user asked>"` to get structured feedback on your uncommitted changes. The prompt helps the reviewer verify the changes match the original intent.
If the review surfaces issues, fix them before considering the task complete.
```

## Phase 2 — E2E Eval Creation + Running

### The Incremental Approach

E2E setups are bespoke. Some projects need a full production-like environment (multiple backend servers, databases, third-party services). Setting up everything at once is wasteful and overwhelming.

**Instead, evalbuff builds e2e infrastructure incrementally:**

1. User describes ONE concrete e2e flow to check (e.g. "user signs up and creates a project")
2. An agent (defined via codebuff SDK) analyzes the codebase and figures out what's needed to test that one flow
3. Outputs a plan — walks the developer through manual steps, automates what it can
4. Creates the task definition in `.agents/evals/tasks/signup-flow/PROMPT.md`
5. When the user adds another flow, the agent diffs what's already set up and only adds what's missing

This way we never set up unnecessary infrastructure. Each new flow is additive.

### `evalbuff run`

- Define core flows for the app that should be tested
- Grade output quality with LLM judges
- Run in CI or locally
- Optimize over time for speed and cost

## Phase 3 — Self-Improvement Flywheel

### `evalbuff learn`

Runs a coding agent + evals, then iterates on its own evals and knowledge to make them:

- **More discerning** — better at catching real issues
- **More efficient** — faster, cheaper to run
- Improves `evalbuff context` by saving more knowledge and configuring subagents

The key insight: improving evals and knowledge is more important than updating skills/AGENTS.md. `evalbuff context` is a dynamic skill that's better than a fixed one, and `evalbuff review` handles the rest.

### `evalbuff refresh`

Intended to run nightly from CI (e.g. GitHub Actions):

- Looks through commits since last refresh point
- Updates eval subagent knowledge
- Updates skills and known patterns
- Keeps evals fresh as the codebase evolves

## Directory Structure

### Evalbuff Package Structure

```
evalbuff/
├── cli/                  # TUI + commands (inspired by codebuff/cli)
├── core/                 # Shared logic: context gathering, review, eval running
├── agents/               # Built-in agent definitions (uses codebuff SDK)
├── skills/               # Skill templates to install into user projects
│   └── evalbuff/
│       └── SKILL.md      # The skill that teaches agents how to use evalbuff
├── BRAINSTORM.md
└── README.md
```

### What Evalbuff Manages in the User's Project

```
.agents/
├── skills/
│   └── evalbuff/
│       └── SKILL.md               # Installed by `evalbuff init` — teaches agents to use evalbuff
├── evals/
│   ├── evalbuff.json              # Config (LLM provider, settings)
│   ├── tasks/                     # E2E flow definitions
│   │   └── <task-short-name>/
│   │       ├── PROMPT.md          # What to check + success criteria (or SPEC.md)
│   │       └── traces/            # Historical run traces
│   └── review-tasks/              # Review-specific eval tasks
├── agent-definitions/             # Custom subagents
└── knowledge/
    └── *.md                       # Project knowledge, lessons, gotchas

.claude/
└── skills/
    └── evalbuff/
        └── SKILL.md               # Same skill, for Claude Code compatibility
```

## Key Ideas

### Evals Are Never Done

> "Everything could be an eval and then the rest of the system optimizes for it." — Alex

> "Even human vibes can be encoded."

There are always ways to improve evals. The `learn` command creates a flywheel that manual tests never have.

### Decoupled from the Coding Agent

Evalbuff runs separately from the coding agent. This:

- Gets around the subsidized coding agent pricing problem
- Works with ANY coding agent, not just Codebuff
- Makes `evalbuff context` a viral hook — it makes every coding agent better

### The Context Command as a Trojan Horse

`evalbuff context` is the easiest entry point. No eval setup required. Just install and immediately get better results from whatever coding tool you already use. Once teams see the value, they naturally want `review`, then `run`, then the full flywheel.

## Open Questions

- How should LLM provider configuration work? API keys from the user vs. evalbuff-hosted?
- Should `evalbuff run` spin up infrastructure itself, or just validate that the user has set it up?
- What's the pricing model? Per-eval-run? Subscription? Free tier for `context` + `review`?
- How much of the codebuff SDK can we reuse vs. what needs to be evalbuff-specific?
- Should traces be stored locally, in the cloud, or both?
- How do we handle projects with existing test infrastructure (Playwright, Cypress, etc.) — integrate or replace?
