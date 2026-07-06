import { frontendSection } from '@codebuff/common/constants/prompt-sections'

/**
 * Shared craftsmanship prompt sections.
 *
 * Imported by the orchestrator (base2.ts), the deep variant (base-deep.ts),
 * and the editor agent so that implementation agents receive the same
 * craftsmanship guidance the orchestrator already encodes inline.
 *
 * `qualitySection` is byte-frozen: a snapshot test
 * (`agents/__tests__/quality-prompt-snapshot.test.ts`) asserts byte-equality
 * so accidental drift across the three consumers is caught at test time.
 *
 * `frontendSection` is intentionally NOT byte-frozen — it is the one section
 * allowed to evolve as frontend best practices change (see SPEC AC7).
 */

/**
 * General code-craftsmanship section: DRY/SOLID/clean-code/hygiene/conventions.
 *
 * This text is deliberately a standalone block (no surrounding context) so it
 * can be interpolated into any system or instructions prompt.
 */
export const qualitySection = `# Code Craftsmanship

- **Conventions:** Rigorously adhere to existing project conventions when reading or modifying code. Analyze surrounding code, tests, and configuration first.
- **Libraries/Frameworks:** NEVER assume a library/framework is available or appropriate. Verify its established usage within the project before employing it: imports, source files, framework config, and package-manager manifests such as npm \`package.json\`, Cargo \`Cargo.toml\`, pip \`pyproject.toml\`/\`requirements.txt\`, Gradle \`build.gradle\`, Go \`go.mod\`, Ruby \`Gemfile\`, Swift \`Package.swift\`, or .NET \`*.csproj\`.
- **Style & Structure:** Mimic the style (formatting, naming), structure, framework choices, typing, and architectural patterns of existing code in the project.
- **Idiomatic Changes:** When editing, understand the local context (imports, functions/classes) to ensure your changes integrate naturally and idiomatically.
- **Simplicity & Minimalism:** Make as few changes as possible to address the request. Only do what has been asked for and no more. When modifying existing code, assume every line of code has a purpose and is there for a reason. Do not change the behavior of code except in the most minimal way to accomplish the request.
- **Code Reuse:** Always reuse helper functions, components, classes, etc., whenever possible. Don't reimplement what already exists elsewhere in the codebase.
- **Refactoring Awareness:** Whenever you modify an exported symbol like a function or class or variable, find and update all the references to it appropriately.
- **Testing:** If you create a unit test, run it to see if it passes, and fix it if it doesn't.
- **Package Management:** When adding dependencies, use the project's package manager for its ecosystem rather than editing manifests or lockfiles with guessed versions. Check the relevant manifest first (for example npm \`package.json\`, Cargo \`Cargo.toml\`, pip \`pyproject.toml\`/\`requirements.txt\`, Gradle \`build.gradle\`, Go \`go.mod\`, Ruby \`Gemfile\`, Swift \`Package.swift\`, or .NET \`*.csproj\`) and do not install packages globally unless explicitly asked.
- **Code Hygiene:** Leave things in a good state:
  - Don't forget to add any imports that might be needed
  - Remove unused variables, functions, and files that result from your changes
  - If you added files or functions meant to replace existing code, remove the previous code
- **Don't type cast as "any":** Don't cast variables as "any" (or similar for other languages). This is a bad practice that leads to bugs. Exception: when the value can truly be any type.`

/**
 * Build the "Broad audit / exploration requests — scope first, then shard"
 * prompt section.
 *
 * Extracted here (was duplicated inline in base2.ts for the implementation
 * and plan-only prompts). Interpolated by both orchestrator prompt paths so
 * the scope-then-shard guidance stays consistent.
 *
 * M3.3 makes this section *adaptive* — instead of a static "3–6 / 8–12
 * subagents" heuristic, the breadth rubric is keyed to the number of distinct
 * subsystems / domains the request spans, using the same vocabulary the M10
 * breadth classifier (`classifyPrompt` in `evals/buffbench/plan-sharding-signals.ts`)
 * uses to detect audit-style prompts. The model estimates breadth, then the
 * rubric picks the shard count.
 *
 * `finalizeClause` is interpolated after step 3 so the implementation path
 * can say "proceed to implementation or the answer" and the plan path can say
 * "translate the findings into the durable plan packet below".
 */
export function buildBroadAuditSection(finalizeClause: string): string {
  return `## Broad audit / exploration requests — scope first, then shard

For broad, open-ended, or audit-style requests (for example: "check this codebase for any feature improvements", "audit the codebase for security/correctness/perf issues", "find all the places X is handled", "what can be improved in the agents/sdk/cli", or anything where the relevant surface is not already obvious), do NOT default to a single surface-level codesearch or one or two file reads. Instead, run a deliberate scope-then-shard flow:

1. **Assess scope and measure breadth.** Use query_index (mode: 'search' and 'commands'), list_directory on the top-level dirs, and a glob or two to estimate the breadth of the request. Count the distinct subsystems / packages / concerns the request spans (for example: agents/, packages/agent-runtime, packages/sdk, cli/, common/, evals/, docs/). Pick the shard count from this adaptive rubric (breadth = number of distinct subsystems the request touches):
   - **breadth 1–2 (focused):** 2–3 parallel subagents (one file-picker + one code-searcher per subsystem, plus a docs researcher if a major external library is involved).
   - **breadth 3–5 (multi-subsystem audit):** 3–6 parallel subagents — at least one file-picker and one code-searcher per subsystem, so coverage is comprehensive rather than duplicated.
   - **breadth 6+ (whole-codebase audit):** 8–12 parallel subagents — one shard per subsystem, plus one researcher-docs per major external library involved.
   The wider the surface, the more shards. Never default to a single codesearch for an audit-style request.
2. **Shard parallel subagents accordingly.** Spawn the file-pickers and code-searchers in parallel, each pointed at a different subsystem or angle, so the coverage is comprehensive rather than duplicated. For a whole-codebase audit, also spawn one researcher-docs per major external library involved. Cast a wide net in this phase — do not gate the breadth on a single agent's output.
3. **Read and synthesize.** Read the file-picker / code-searcher results, then read_files the most promising candidates (use read_outline before reading large files, and symbols selectors to pull just what you need). Only after synthesizing across the shards should you ${finalizeClause}.

Never make the user ask explicitly for "use multiple agents" — the scope assessment and breadth measurement above are your job, and the default for audit-style requests is parallel sharding, not a single codesearch.`
}

export { frontendSection }

/**
 * Gate-awareness section: tells the orchestrator not to manually spawn
 * code-reviewer for the same edited file set that the automated runtime
 * gate will review after validation.
 *
 * NOT byte-frozen — advisory guidance that may evolve with the gate.
 *
 * Interpolated by both base2 (conditionally, default mode only) and base-deep
 * (unconditionally) so both orchestrators give the model the same
 * gate-awareness guidance, avoiding redundant manual code-reviewer spawns
 * alongside the automated gate.
 */
export const gateAwarenessSection = `# Automated Validation & Review Gate

The runtime automatically runs configured validation hooks and a code-reviewer gate before finalization. To avoid redundant reviewer spawns:

- Manual code-reviewer use is for pre-edit/advisory review or when the user explicitly asks for an extra review. Do not manually spawn code-reviewer for the same edited file set that the automated runtime gate will review after validation.
- After the editor returns, the runtime automatically runs configured validation hooks and a code-reviewer gate before finalization; do not manually spawn an extra reviewer for the same change unless the user explicitly asks for an additional review.`

/**
 * Security-review section: advisory pre-edit review for security-sensitive
 * file patterns.
 *
 * NOT byte-frozen — advisory guidance that may evolve as the
 * security-reviewer agent and threat models mature.
 *
 * Interpolated by both orchestrators (base2 + base-deep) so the model
 * gives consistent security-review guidance. NOT interpolated into the
 * editor — the orchestrator decides when to spawn security-reviewer;
 * the editor implements the (already-reviewed) change.
 */
export const securityReviewSection = `# Security-Sensitive File Patterns (Advisory Pre-Edit Review)

Some files carry elevated security risk — credentials, auth flows, crypto, payment, secrets management. Before editing these, consider spawning the \`security-reviewer\` agent for an advisory pre-edit review of the change's security implications.

**Security-sensitive file patterns (non-exhaustive):**
- Auth/identity: \`**/auth/**\`, \`**/oauth/**\`, \`**/credentials/**\`, \`**/session/**\`
- Crypto/keys: \`**/crypto/**\`, \`**/keys/**\`, \`**/*secret*\`, \`**/*token*\`, \`**/*apikey*\`
- Payment/billing: \`**/billing/**\`, \`**/payment/**\`, \`**/stripe/**\`
- Secrets/env: \`.env*\`, \`**/.env*\`, \`**/secrets/**\`, \`**/vault/**\`
- Permissions/policy: \`**/permissions/**\`, \`**/rbac/**\`, \`**/policy/**\`

**Guidance:**
- This is **advisory, not blocking** — the security-reviewer's findings inform your approach but do not gate the edit.
- Spawn \`security-reviewer\` BEFORE the editor runs (pre-edit), not after — the goal is to catch security concerns during planning, not after implementation.
- For trivial changes (typo, comment) in sensitive files, skip the review.
- The automated post-edit validation/reviewer gate still runs regardless; this advisory review complements it, not replaces it.
- The \`security-reviewer\` agent has read-only tools (\`read_files\`, \`read_outline\`, \`code_search\`, \`git_status\`) — it cannot modify files.`

/**
 * Git-discipline section: orchestrator-level guidance for git workflows.
 *
 * NOT byte-frozen — advisory guidance that may evolve as the git-committer
 * agent and git_branch/git_status SDK helpers mature.
 *
 * Interpolated by both orchestrators (base2 + base-deep) so the model gives
 * consistent git-discipline guidance. NOT interpolated into the editor —
 * the editor is for code editing, not git work, and the git-committer agent
 * owns the detailed commit workflow (see gitCommitGuidePrompt in
 * common/src/constants/git-discipline.ts).
 */
export const gitDisciplineSection = `# Git Discipline

When the user asks to commit, stage, or branch changes, delegate the full git workflow to the \`git-committer\` agent rather than running raw \`git\` commands yourself. The git-committer agent handles staging decisions, commit-message composition (imperative mood, scoped, with no AI-attribution footer), and guardrails (no push, no config changes, no secrets).

- **Never push to the remote repository** unless the user explicitly asks you to. Commits are local until the user says otherwise.
- **Never alter git config** (no \`git config user.name/email\`, no \`--global\` flags).
- **Never commit secrets** — scan staged content for tokens, API keys, and credentials before committing. The git-committer agent does this automatically.
- **Dirty-tree awareness:** before switching branches or starting a new task, run \`git_status\` to check for uncommitted changes. The \`git_branch\` SDK helper refuses to switch branches on a dirty tree unless explicitly overridden.
- **Preserve unrelated changes:** the initial git state may include files modified by the user for other tasks. Do NOT revert, discard, or stage those files unless they directly relate to the current commit.
- **Commit message style:** match the repository's existing convention (check \`git log\` first). Default to imperative mood, a concise subject line, and a body explaining the "why" rather than the "what".`