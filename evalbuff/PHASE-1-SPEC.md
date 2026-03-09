# Evalbuff — Phase 1 Spec

> Phase 1 delivers three CLI commands (`init`, `context`, `review`), authentication, and skill installation. No TUI. Markdown output to stdout. LLM calls go through the Codebuff backend via the SDK.

## Table of Contents

- [Overview](#overview)
- [Installation](#installation)
- [Authentication](#authentication)
- [Commands](#commands)
  - [`evalbuff init`](#evalbuff-init)
  - [`evalbuff context`](#evalbuff-context)
  - [`evalbuff review`](#evalbuff-review)
  - [`evalbuff login`](#evalbuff-login)
  - [`evalbuff logout`](#evalbuff-logout)
  - [`evalbuff --help` / `--version`](#evalbuff---help----version)
- [Skill Installation](#skill-installation)
- [Initial Project Scan](#initial-project-scan)
- [Configuration File](#configuration-file)
- [Agent Definitions](#agent-definitions)
- [Package Structure](#package-structure)
- [Technical Architecture](#technical-architecture)
- [Error Handling](#error-handling)
- [UX Details](#ux-details)
- [Non-Goals](#non-goals)
- [Acceptance Criteria](#acceptance-criteria)

---

## Overview

Phase 1 is the minimum useful product: a developer installs evalbuff, runs `evalbuff init` in their project, and immediately gets two capabilities:

1. **`evalbuff context <prompt>`** — any coding agent (or human) can call this to get relevant files, background knowledge, and gotchas before starting work.
2. **`evalbuff review [prompt]`** — after making changes, get structured feedback on what went wrong and why. The optional prompt provides context about the original request, giving the reviewer deeper understanding of intent.

`evalbuff init` also installs a **skill file** into the project so that coding agents (Codebuff, Claude Code) automatically know to call these commands.

## Installation

Evalbuff is published to npm as a standalone package:

```bash
npm install -g evalbuff
```

The package is built as a compiled binary (same approach as the Codebuff CLI — using `bun build --compile`), so users don't need Bun or Node installed. The npm package uses platform-specific optional dependencies (like esbuild and turbo do) to download the correct binary.

For CI, install globally and cache the binary, or use `npx`:

```bash
npx evalbuff review --branch main
```

## Authentication

Evalbuff uses the same Codebuff backend and user accounts. Authentication works identically to the Codebuff CLI.

### Login Flow

1. User runs any command that requires auth (or explicitly runs `evalbuff login`).
2. CLI opens a browser to the Codebuff login page.
3. User authenticates in the browser.
4. CLI polls for authentication completion, stores credentials locally.

### Credential Storage

- Credentials are stored at `~/.config/evalbuff/credentials.json` (separate from Codebuff credentials).
- Same schema: `{ "default": { "name", "email", "authToken", ... } }`.
- If the user is already logged into Codebuff, evalbuff could detect this and offer to reuse the session (stretch goal — not required for Phase 1).

### CI / Non-Interactive Auth

- The `EVALBUFF_API_KEY` environment variable provides auth in CI environments.
- When set, it takes precedence over stored credentials.
- No browser login is triggered when an API key is present.

---

## Commands

### `evalbuff init`

Initialize evalbuff in a project. Sets up configuration, installs skill files, and runs an initial project scan.

#### Usage

```
evalbuff init [options]
```

#### Options

| Flag | Description |
|------|-------------|
| `--cwd <path>` | Project root directory (defaults to current directory) |
| `--skip-scan` | Skip the initial project scan, just create config and install skills |
| `--force` | Overwrite existing configuration and skill files without prompting (does NOT overwrite knowledge files) |

#### Behavior

1. **Check authentication** — trigger login flow if not authenticated.
2. **Detect project root** — find the nearest git root or use `--cwd`.
3. **Check if already initialized** — if `evalbuff.json` exists, prompt to overwrite config and skill files (or use `--force`). Knowledge files are never overwritten by `--force`.
4. **Create configuration file** — write `.agents/evals/evalbuff.json` with defaults.
5. **Install skill files** — write `SKILL.md` to both:
   - `.agents/skills/evalbuff/SKILL.md`
   - `.claude/skills/evalbuff/SKILL.md`
6. **Create knowledge directory** — ensure `.agents/knowledge/` exists.
7. **Run initial project scan** — unless `--skip-scan`, execute the Scan Agent (see [Initial Project Scan](#initial-project-scan)) to bootstrap knowledge files. If knowledge files already exist, the scan agent merges new observations rather than overwriting.
8. **Print summary** — show what was created, where skill files were installed, and suggest next steps.

#### Output

```
✓ Created .agents/evals/evalbuff.json
✓ Installed skill to .agents/skills/evalbuff/SKILL.md
✓ Installed skill to .claude/skills/evalbuff/SKILL.md
✓ Generated project knowledge (4 files)

Evalbuff is ready! Your coding agents will now automatically use evalbuff for context and review.

Try it:
  evalbuff context "add user authentication"
  evalbuff review
```

---

### `evalbuff context`

Returns relevant files, background knowledge, and gotchas for a given prompt. Designed to be called by coding agents before starting a task, or by humans to explore what's relevant.

#### Usage

```
evalbuff context <prompt> [options]
```

#### Options

| Flag | Description |
|------|-------------|
| `--cwd <path>` | Project root directory (defaults to current directory) |
| `--max-files <n>` | Maximum number of files to return (default: 15) |
| `--files-only` | Output only file paths, one per line (for piping) |

#### Behavior

1. **Check authentication** — trigger login flow if not authenticated.
2. **Locate project root** — find nearest git root or use `--cwd`.
3. **Load configuration** — read `evalbuff.json` if it exists (works without init, with a warning).
4. **Execute the Context Agent** — send the prompt, project file tree, and any existing knowledge to the Codebuff backend via SDK.
5. **Output markdown to stdout**.

#### Progress Feedback

Since `context` involves LLM calls that may take 10-30 seconds, the CLI writes progress indicators to **stderr** (keeping stdout clean for the markdown output):

```
⠋ Scanning project structure...
⠋ Finding relevant files...
⠋ Synthesizing context...
```

The spinner and status messages go to stderr so that piping stdout (e.g. `evalbuff context "add auth" > context.md`) works cleanly. In non-TTY environments (CI), progress messages are suppressed.

#### Output Format

The output is markdown with three sections:

```markdown
## Relevant Files

- **`src/auth/login.ts`** — Handles user login flow, validates credentials, issues JWT tokens
- **`src/middleware/auth-guard.ts`** — Express middleware that checks JWT on protected routes
- **`src/db/models/user.ts`** — User model with password hashing and verification methods
- **`tests/auth/login.test.ts`** — Existing tests for the login flow

## Background

This project uses Express with JWT authentication. The auth system was recently
refactored (see commit abc123) to use refresh tokens. The User model uses bcrypt
for password hashing with a cost factor of 12.

The API follows REST conventions with routes defined in `src/routes/index.ts`.
Auth routes are mounted at `/api/auth/*`.

## Gotchas

- The JWT secret is loaded from `process.env.JWT_SECRET` — make sure it's set in `.env.test` for tests.
- The User model has a `beforeSave` hook that auto-hashes passwords — don't hash manually.
- Rate limiting is applied to `/api/auth/login` (5 attempts per minute) — tests need to account for this.
```

When `--files-only` is passed, output is just the file paths:

```
src/auth/login.ts
src/middleware/auth-guard.ts
src/db/models/user.ts
tests/auth/login.test.ts
```

#### Without Init

If evalbuff has not been initialized (no `evalbuff.json`), the command still works but:
- Prints a warning to stderr: `Warning: evalbuff not initialized. Run "evalbuff init" for better results.`
- The "Background" and "Gotchas" sections will be less informed (no project knowledge to draw from).
- File picking still works based on the file tree and code search.

---

### `evalbuff review`

Reviews code changes and outputs structured feedback. Designed for coding agents to self-check, for CI to gate PRs, or for humans to get a second opinion.

The optional `<prompt>` provides context about the original user request and what the reviewer should focus on. This is especially valuable when a coding agent calls `evalbuff review` — it can pass along the user's original instructions so the reviewer understands the *intent* behind the changes, not just the diff.

#### Usage

```
evalbuff review [prompt] [options]
```

#### Options

| Flag | Description |
|------|-------------|
| `--cwd <path>` | Project root directory (defaults to current directory) |
| `--files <paths...>` | Scope the review to specific files |
| `--branch [base]` | Compare current branch against a base branch (defaults to `main` or configured default branch) |
| `--commit <sha>` | Review a specific commit |
| `--staged` | Review only staged changes (`git diff --cached`) |

#### Prompt

The prompt is an optional positional argument. It tells the Review Agent what the user originally asked for and what aspects to pay attention to. Examples:

```bash
# Coding agent passes along the user's original request
evalbuff review "The user asked to add JWT authentication to the API routes"

# Human describes what they were working on
evalbuff review "Refactored the database layer to use connection pooling"

# With additional options
evalbuff review "Add pagination to the /users endpoint" --branch main
evalbuff review "Fix the race condition in the queue worker" --staged
evalbuff review "Migrate from Express to Fastify" --files src/server.ts src/routes/index.ts
```

When a prompt is provided, the Review Agent uses it to:
- Verify the changes actually accomplish what was requested
- Check for missing pieces (e.g. "user asked for auth but no tests were added")
- Evaluate whether the approach is appropriate for the stated goal
- Provide more targeted, relevant feedback

Without a prompt, the Review Agent still works — it just reviews the diff on its own merits without knowledge of the original intent.

#### Input Modes

1. **Default (no file scoping)** — reviews all uncommitted changes (staged + unstaged): `git diff HEAD`
2. **Specific files** — `evalbuff review --files src/auth.ts src/db.ts` — reviews uncommitted changes in those files only
3. **Branch comparison** — `evalbuff review --branch` — reviews the diff between the current branch and its merge base with the default branch (e.g. `main`). Optionally specify a different base: `evalbuff review --branch develop`
4. **Staged only** — `evalbuff review --staged` — reviews only staged changes
5. **Specific commit** — `evalbuff review --commit abc123` — reviews the diff introduced by that commit

#### Behavior

1. **Check authentication** — trigger login flow if not authenticated.
2. **Locate project root** — find nearest git root or use `--cwd`.
3. **Collect the diff** — use the appropriate `git diff` command based on input mode.
4. **Bail if empty** — if there's no diff, print a message and exit cleanly.
5. **Load project knowledge** — read `.agents/knowledge/` files if they exist.
6. **Execute the Review Agent** — send the prompt (if provided), diff, file context (full files being modified), and knowledge to the backend via SDK.
7. **Output markdown to stdout**.

#### Output Format

When a prompt is provided (e.g. `evalbuff review "Add JWT authentication to the API routes"`), the output includes a **Goal Assessment** subsection:

```markdown
## Review Summary

Reviewed 4 files with 127 lines changed. Found 1 critical issue, 2 warnings, and 3 suggestions.

### Goal Assessment

**Prompt:** "Add JWT authentication to the API routes"

✅ JWT token generation and verification is implemented in `src/auth/jwt.ts`.
✅ Auth middleware is applied to protected routes.
⚠️ No refresh token mechanism — the prompt didn't specify this, but the token expiry is set to 15 minutes with no way to renew without re-login.
❌ The `/api/admin/*` routes are not protected — these likely need auth too.

## Issues
```

When no prompt is provided, the Goal Assessment subsection is omitted and the output begins directly with the summary stats:

```markdown
## Review Summary

Reviewed 4 files with 127 lines changed. Found 1 critical issue, 2 warnings, and 3 suggestions.

## Issues

### 🔴 Critical: SQL injection vulnerability in user search

**`src/db/queries/users.ts:45`**

The `searchUsers` function interpolates user input directly into a SQL query string.
This allows arbitrary SQL injection.

```ts
// Current (vulnerable)
const query = `SELECT * FROM users WHERE name LIKE '%${searchTerm}%'`

// Suggested fix
const query = `SELECT * FROM users WHERE name LIKE $1`
const params = [`%${searchTerm}%`]
```

---

### 🟡 Warning: Missing error handling in auth middleware

**`src/middleware/auth-guard.ts:23`**

The JWT verification call doesn't handle the case where the token is malformed
(not just expired). This will throw an unhandled exception and crash the process.

---

### 🟡 Warning: Test coverage gap

**`src/auth/login.ts`**

The new `rememberMe` parameter changes token expiry but no tests cover this behavior.
Consider adding tests for both `rememberMe: true` and `rememberMe: false`.

## Suggestions

- 💡 Consider adding input validation for the `email` field in `src/auth/register.ts` — currently accepts any string.
- 💡 The `findUserByEmail` query in `src/db/queries/users.ts` could use a database index on `email` for better performance.
- 💡 The error messages in `src/auth/login.ts` distinguish between "user not found" and "wrong password" — this leaks information about valid accounts. Consider a generic "invalid credentials" message.

## Stats

| Metric | Value |
|--------|-------|
| Files reviewed | 4 |
| Lines changed | +89 / -38 |
| Critical issues | 1 |
| Warnings | 2 |
| Suggestions | 3 |
```

#### Progress Feedback

Since `review` involves LLM calls that may take 10-30 seconds, the CLI writes progress indicators to **stderr** (keeping stdout clean for the markdown output):

```
⠋ Collecting diff...
⠋ Analyzing 4 changed files...
⠋ Generating review...
```

The spinner and status messages go to stderr so that piping stdout (e.g. `evalbuff review > review.md`) works cleanly. In non-TTY environments (CI), progress messages are suppressed.

#### Exit Codes

| Code | Meaning |
|------|---------|
| `0` | Review complete, no critical issues |
| `1` | Review complete, critical issues found |
| `2` | Error (auth failure, network error, not a git repo, etc.) |

The non-zero exit on critical issues makes `evalbuff review` usable as a CI gate:

```yaml
# GitHub Actions example
- name: Evalbuff Review
  run: evalbuff review "PR changes" --branch main
  env:
    EVALBUFF_API_KEY: ${{ secrets.EVALBUFF_API_KEY }}
```

---

### `evalbuff login`

Explicitly trigger the authentication flow.

#### Usage

```
evalbuff login
```

#### Behavior

1. Open browser to Codebuff login page.
2. Poll for completion.
3. Store credentials at `~/.config/evalbuff/credentials.json`.
4. Print success message with user email.

---

### `evalbuff logout`

Clear stored credentials.

#### Usage

```
evalbuff logout
```

#### Behavior

1. Remove stored credentials from `~/.config/evalbuff/credentials.json`.
2. Print confirmation.

---

### `evalbuff --help` / `--version`

Standard help and version output.

```
$ evalbuff --help

evalbuff — Codebase-specific evals, context, and review for AI coding agents

Commands:
  init               Initialize evalbuff in a project
  context <prompt>   Get relevant files, knowledge, and gotchas for a task
  review [prompt]    Review code changes with structured feedback
  login              Authenticate with evalbuff
  logout             Clear stored credentials

Options:
  --cwd <path>       Project root directory
  --help             Show help
  --version          Show version
```

---

## Skill Installation

The installed `SKILL.md` is the integration layer that makes coding agents aware of evalbuff. It's a markdown file with YAML frontmatter, following the standard skill format.

### Template

```markdown
---
name: evalbuff
description: Use evalbuff to get project context before coding and review changes before committing
---

# Evalbuff

This project uses evalbuff for AI-assisted context gathering and change review.

## Before Starting a Task

Run evalbuff to get oriented before making changes:

    evalbuff context "<description of what you're about to do>"

This returns:
- **Relevant files** with summaries — so you know what to read
- **Background knowledge** about the systems involved
- **Gotchas and lessons** from past work — so you avoid known pitfalls

Use this output to inform which files to read and what to watch out for.

## After Making Changes

Run evalbuff to review your changes before considering the task complete. Include a description of what the user originally asked for so the reviewer can verify the changes match the intent:

    evalbuff review "<description of what the user asked you to do>"

This returns structured feedback including:
- 🔴 **Critical issues** that must be fixed
- 🟡 **Warnings** that should be addressed
- 💡 **Suggestions** for improvement
- Whether the changes actually accomplish the stated goal

If there are critical issues (🔴), fix them and re-run the review.
If there are only warnings and suggestions, use your judgment.

## Tips

- Always run `evalbuff context` first — it often surfaces non-obvious files and gotchas.
- Always pass the user's original request to `evalbuff review` — this helps catch missing requirements and verify the changes match intent.
- Run `evalbuff review` even for small changes — it catches things like missing error handling, test gaps, and convention violations.
- You can review specific files: `evalbuff review "add auth" --files src/auth.ts src/db.ts`
- You can review staged changes only: `evalbuff review "fix login bug" --staged`
```

### Installation Targets

`evalbuff init` writes this file to:

1. **`.agents/skills/evalbuff/SKILL.md`** — discovered by Codebuff and any SDK-based agent
2. **`.claude/skills/evalbuff/SKILL.md`** — discovered by Claude Code

Both files have identical content.

---

## Initial Project Scan

When `evalbuff init` runs (without `--skip-scan`), it executes the **Scan Agent** to analyze the project and bootstrap knowledge files.

### What the Scan Agent Does

1. **Reads the project file tree** — directory structure, file types, key config files.
2. **Identifies the tech stack** — languages, frameworks, build tools, package managers (from `package.json`, `Cargo.toml`, `requirements.txt`, `build.gradle`, etc.).
3. **Detects architectural patterns** — monorepo vs single package, microservices, API structure, frontend/backend split.
4. **Finds existing test infrastructure** — test frameworks, test directories, CI configuration.
5. **Reads key configuration files** — linter configs, CI workflows, Dockerfiles, etc.
6. **Scans for existing knowledge** — `README.md`, `CONTRIBUTING.md`, `AGENTS.md`, `knowledge.md`, existing skill files.

### Generated Knowledge Files

The scan generates markdown files in `.agents/knowledge/`:

| File | Contents |
|------|----------|
| `architecture.md` | High-level overview: project type, directory structure, how components relate |
| `tech-stack.md` | Languages, frameworks, key dependencies, build system, runtime |
| `conventions.md` | Coding patterns observed: naming, file organization, error handling patterns |
| `testing.md` | Test frameworks, test directory layout, how to run tests, CI setup |

These files are read by the Context and Review agents to provide more informed output.

### Scan Agent Tools

The Scan Agent needs access to:
- **File read** — read config files, README, etc.
- **Directory listing** — understand project structure
- **Code search** — find patterns, imports, test files
- **File tree** — get the full project layout

---

## Configuration File

Located at `.agents/evals/evalbuff.json`.

### Schema

```json
{
  "version": 1,
  "project": {
    "name": "my-project",
    "description": "Brief description of the project"
  },
  "context": {
    "maxFiles": 15,
    "excludePatterns": [
      "dist/**",
      "node_modules/**",
      "*.generated.ts"
    ]
  },
  "review": {
    "defaultBranch": "main"
  }
}
```

### Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `version` | `number` | Yes | Config version, always `1` for Phase 1 |
| `project.name` | `string` | No | Project name (auto-detected from package.json or directory name) |
| `project.description` | `string` | No | Brief project description (auto-detected from README or package.json) |
| `context.maxFiles` | `number` | No | Default max files returned by `context` (default: 15) |
| `context.excludePatterns` | `string[]` | No | Glob patterns to exclude from context file picking |
| `review.defaultBranch` | `string` | No | Branch to compare against in `--branch` mode (default: "main") |

---

## Agent Definitions

Phase 1 requires three agents, all defined as Codebuff SDK agent definitions and executed against the Codebuff backend.

### Scan Agent

**Purpose:** Analyze a project during `evalbuff init` and generate knowledge files.

**Input:**
- Project file tree
- Contents of key config files (auto-detected)

**Output:**
- Creates/writes knowledge markdown files to `.agents/knowledge/`

**Tools:** file read, directory listing, code search, file write (restricted to `.agents/knowledge/` only)

The Scan Agent generates a fixed set of knowledge files (`architecture.md`, `tech-stack.md`, `conventions.md`, `testing.md`). It does not create arbitrary files. If these files already exist, it reads them first and merges new observations rather than replacing user-curated content.

### Context Agent

**Purpose:** Given a user prompt, return relevant files, background knowledge, and gotchas.

**Input:**
- The user's prompt (what they're about to work on)
- Project file tree
- Contents of `.agents/knowledge/*.md`
- `evalbuff.json` configuration

**Output:**
- Markdown to stdout with three sections: Relevant Files, Background, Gotchas

**Tools:** file read, directory listing, code search (all read-only — no writes)

### Review Agent

**Purpose:** Given code changes and (optionally) the original user request, return structured review feedback.

**Input:**
- The user's prompt describing what was requested and what to review (optional — if omitted, the agent reviews the diff on its own merits)
- The git diff
- Full contents of modified files (for context around the diff)
- Contents of `.agents/knowledge/*.md`
- `evalbuff.json` configuration

When a prompt is provided, the Review Agent evaluates both the *quality* of the code changes and whether they *fulfill the stated intent*. This means it can catch issues like:
- Missing requirements ("the user asked for pagination but there's no limit/offset parameter")
- Scope creep ("the changes also refactored the logger, which wasn't requested")
- Wrong approach ("the user asked for JWT auth but the changes implement session-based auth")

**Output:**
- Markdown to stdout with sections: Review Summary, Issues (🔴/🟡), Suggestions (💡), Stats
- When a prompt was provided, the Review Summary includes a **Goal Assessment** — whether the changes accomplish the stated objective
- Exit code: 0 if no critical issues, 1 if critical issues found

**Tools:** file read, code search (all read-only — no writes)

---

## Package Structure

Everything lives within the monorepo under `evalbuff/`.

```
evalbuff/
├── cli/
│   ├── src/
│   │   ├── index.ts                  # Entry point, argument parsing
│   │   ├── commands/
│   │   │   ├── init.ts               # evalbuff init
│   │   │   ├── context.ts            # evalbuff context
│   │   │   ├── review.ts             # evalbuff review [prompt]
│   │   │   ├── login.ts              # evalbuff login
│   │   │   └── logout.ts             # evalbuff logout
│   │   ├── utils/
│   │   │   ├── auth.ts               # Credential storage and retrieval
│   │   │   ├── config.ts             # evalbuff.json reading/writing
│   │   │   ├── git.ts                # Git operations (diff, branch detection)
│   │   │   ├── knowledge.ts          # Reading/writing knowledge files
│   │   │   ├── output.ts             # Markdown formatting helpers
│   │   │   └── project.ts            # Project root detection, file tree
│   │   └── templates/
│   │       └── SKILL.md              # Skill template to install
│   ├── package.json
│   └── tsconfig.json
├── agents/
│   ├── scan-agent.ts                 # Scan Agent definition (SDK agent)
│   ├── context-agent.ts              # Context Agent definition (SDK agent)
│   └── review-agent.ts               # Review Agent definition (SDK agent)
├── BRAINSTORM.md
├── PHASE-1-SPEC.md
└── README.md
```

### Dependencies

The `evalbuff/cli` package depends on:
- `@codebuff/sdk` — for executing agents against the Codebuff backend
- `commander` — for CLI argument parsing
- `zod` — for config schema validation

It does **not** depend on the full Codebuff CLI (no TUI framework, no React, no OpenTUI).

---

## Technical Architecture

```
┌─────────────────────────────────────────────────────┐
│  User's Terminal                                     │
│                                                      │
│  $ evalbuff context "add user auth"                  │
│                                                      │
│  ┌─────────────────────┐                             │
│  │  evalbuff CLI        │                            │
│  │  (argument parsing,  │                            │
│  │   auth, git ops)     │                            │
│  └──────────┬──────────┘                             │
│             │                                        │
│             ▼                                        │
│  ┌─────────────────────┐     ┌────────────────────┐  │
│  │  @codebuff/sdk       │────▶│  Local Tools       │  │
│  │  (agent execution)   │◀────│  (file read, code  │  │
│  └──────────┬──────────┘     │   search, dir list) │  │
│             │                └────────────────────┘  │
└─────────────┼───────────────────────────────────────┘
              │ HTTPS (LLM calls)
              ▼
     ┌──────────────────┐
     │  Codebuff Backend │
     │  (same server as  │
     │   Codebuff CLI)   │
     └──────────────────┘
```

- **CLI layer** handles argument parsing, auth, git operations, and formatting.
- **SDK layer** handles agent execution — sending prompts to the backend, processing tool calls locally.
- **Tools execute locally** — file reads, code search, directory listing all happen on the user's machine. Only the LLM inference calls go to the backend.
- **Output is markdown to stdout** — no TUI rendering, no interactive elements.

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Not in a git repository | `review` exits with error: `"Not a git repository. Run from within a git repo."` · `context` and `init` still work (review needs git for diffs) |
| Not initialized | `context` and `review` work with a warning to stderr: `"evalbuff not initialized. Run 'evalbuff init' for better results."` · Knowledge sections will be sparse |
| No changes to review | Clean exit (code 0): `"No changes to review."` |
| Auth expired / invalid | Prompt to re-login (interactive) or fail with clear message (CI) |
| Network error | `"Failed to connect to evalbuff backend. Check your internet connection and try again."` Exit code 2 |
| `evalbuff.json` malformed | Warning to stderr with specific parse error, fall back to defaults |
| Already initialized | Prompt: `"evalbuff is already initialized. Overwrite? (y/N)"` · `--force` skips prompt |
| LLM rate limit / quota | `"Rate limit exceeded. Please try again in a moment."` or `"Insufficient credits. Visit codebuff.com for more."` Exit code 2 |

---

## UX Details

### Progress Indicators

All commands that make LLM calls (`init` scan, `context`, `review`) show a spinner with status messages on **stderr**. This keeps stdout clean for machine-readable output.

- Spinners use a simple braille animation (`⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏`)
- Status messages update as the operation progresses
- In non-TTY environments (piped output, CI), spinners are suppressed entirely
- On error, the spinner is cleared before printing the error message

### Credit Usage Feedback

After every command that consumes credits (`init`, `context`, `review`), a one-line credit usage summary is printed to **stderr**:

```
✓ Done (0.12 credits used)
```

This helps users track their consumption without cluttering the main output.

### Streaming vs. Buffered Output

For Phase 1, output is **buffered** — the full markdown is written to stdout only after the agent completes. This simplifies implementation and ensures the output is always well-formed markdown.

Streaming output (printing markdown sections as they arrive) is a future improvement. The spinner on stderr provides feedback while the user waits.

## Non-Goals

The following are explicitly out of scope for Phase 1:

- **TUI** — no interactive mode, no `evalbuff` with no args
- **`evalbuff run`** — no eval task execution
- **`evalbuff learn`** — no self-improvement loop
- **`evalbuff refresh`** — no commit scanning
- **Task definitions** — no `.agents/evals/tasks/` directory
- **Traces** — no historical run storage
- **Cursor / Windsurf / Copilot skill targets** — only `.agents/` and `.claude/`
- **JSON output format** — markdown only (JSON can be added later via `--format`)
- **Cloud storage** — everything is local to the project
- **Custom agent definitions** — only the three built-in agents

---

## Acceptance Criteria

### Authentication

- [ ] `evalbuff login` opens browser and completes auth flow
- [ ] Credentials are stored at `~/.config/evalbuff/credentials.json`
- [ ] `evalbuff logout` clears stored credentials
- [ ] `EVALBUFF_API_KEY` env var works for non-interactive auth
- [ ] Commands that need auth trigger login automatically if not authenticated

### `evalbuff init`

- [ ] Creates `.agents/evals/evalbuff.json` with valid default configuration
- [ ] Installs `SKILL.md` to `.agents/skills/evalbuff/SKILL.md`
- [ ] Installs `SKILL.md` to `.claude/skills/evalbuff/SKILL.md`
- [ ] Creates `.agents/knowledge/` directory
- [ ] Runs initial project scan and generates knowledge files (architecture, tech-stack, conventions, testing)
- [ ] `--skip-scan` skips the scan but still creates config and skills
- [ ] `--force` overwrites without prompting
- [ ] Prompts before overwriting existing configuration
- [ ] Prints a clear summary of what was created

### `evalbuff context`

- [ ] Accepts a prompt string and returns markdown to stdout
- [ ] Output contains: Relevant Files (with summaries), Background, Gotchas sections
- [ ] `--max-files` limits the number of files returned
- [ ] `--files-only` outputs just file paths, one per line
- [ ] Works without `evalbuff init` (with warning to stderr)
- [ ] Uses project knowledge when available for richer output
- [ ] Exit code 0 on success, 2 on error

### `evalbuff review`

- [ ] Accepts an optional `[prompt]` positional argument describing the original request and review focus
- [ ] When a prompt is provided, the review includes a Goal Assessment evaluating whether changes fulfill the stated intent
- [ ] When no prompt is provided, the review evaluates changes on their own merits
- [ ] Default: reviews all uncommitted changes (staged + unstaged)
- [ ] `--files <paths...>` scopes the review to specific files
- [ ] `--branch [name]` compares against a branch
- [ ] `--staged` reviews only staged changes
- [ ] `--commit <sha>` reviews a specific commit
- [ ] Output contains: Review Summary (with Goal Assessment if prompt given), Issues (🔴/🟡), Suggestions (💡), Stats
- [ ] Exit code 0 when no critical issues, 1 when critical issues found, 2 on error
- [ ] Prints clean message and exits 0 when there are no changes to review
- [ ] Uses project knowledge for more informed feedback
- [ ] Works without `evalbuff init` (with warning to stderr)

### Skill Installation

- [ ] Installed SKILL.md follows the standard frontmatter format (`name`, `description`)
- [ ] Skill content explains when and how to call `evalbuff context` and `evalbuff review`
- [ ] Skill content describes expected output format
- [ ] Both `.agents/skills/` and `.claude/skills/` targets are created

### UX

- [ ] Progress spinners display on stderr during LLM calls
- [ ] Spinners are suppressed in non-TTY environments
- [ ] Credit usage summary prints to stderr after each command that uses credits

### General

- [ ] `evalbuff --help` prints usage information for all commands
- [ ] `evalbuff --version` prints the current version
- [ ] `--cwd <path>` works on all commands to set the project root
- [ ] All errors produce clear, actionable messages
- [ ] All output goes to stdout (warnings/errors to stderr)
- [ ] Package installs correctly via `npm install -g evalbuff`
