import { publisher } from '../constants'

import type { SecretAgentDefinition } from '../types/secret-agent-definition'

/**
 * Synthesizer agent for the audit-codebase pattern.
 *
 * Spawned AFTER all shard auditors have written their findings to
 * `.agents/sessions/<slug>/findings/*.md`. This agent reads ONLY the finding
 * files (never raw source) and produces a single cross-cutting audit report.
 *
 * This is the "reduce" half of map-reduce: the shards (map) wrote findings to
 * disk so they survive context pruning; this agent synthesizes them without
 * the parent ever holding all findings in its context.
 *
 * See `agents/patterns/audit-codebase.md` for the full flow.
 */
const definition: SecretAgentDefinition = {
  id: 'synthesizer',
  publisher,
  displayName: 'Sam the Synthesizer',
  spawnerPrompt:
    'Reads audit finding files from a scratchpad directory and produces a single cross-cutting audit report. Use this AFTER all shard auditors have written their findings to disk. Do NOT use this to review code directly — it only reads finding files, never raw source.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The absolute or repo-root-relative path to the findings directory (e.g. .agents/sessions/audit-myrepo-2026-06/findings) and the desired output report path (e.g. .agents/sessions/audit-myrepo-2026-06/AUDIT-REPORT.md). State both paths clearly.',
    },
  },
  outputSchema: {
    type: 'object',
    properties: {
      message: {
        type: 'string',
        description:
          'A one-paragraph summary of the synthesized report, including the count of findings by severity and the top cross-cutting themes.',
      },
      reportPath: {
        type: 'string',
        description: 'The path to the written AUDIT-REPORT.md file.',
      },
    },
  },
  outputMode: 'structured_output',
  inheritParentSystemPrompt: true,
  includeMessageHistory: false,
  filesystemScope: {
    read: [
      '.agents/sessions/*/findings',
      '.agents/sessions/*/findings/**/*.md',
      '.agents/sessions/*/findings/*.md',
    ],
    write: ['.agents/sessions/*/AUDIT-REPORT.md'],
  },
  spawnableAgents: [],
  toolNames: [
    'read_files',
    'write_file',
    'list_directory',
    'glob',
    'set_output',
  ],

  instructionsPrompt: `
You are a synthesis agent. Your sole job is to read audit finding files
from ONE designated scratchpad directory and produce ONE cross-cutting audit
report. You are sandboxed to that directory.

## Critical constraints (HARD RULES — violate these and you have failed)
- You read ONLY finding files (*.md) located INSIDE the findings directory
  whose path is stated in the prompt. Every \`read_files\` path argument
  must be that directory or a descendant of it. Concretely: resolve each path
  and reject it (do NOT call read_files on it) if it is outside the findings
  directory, if it contains \`..\`, or if it is an absolute path that is not
  rooted under the findings directory.
- You must NEVER read raw source files (anything under src/, packages/, cli/,
  agents/, sdk/, common/, etc.). If a finding is unclear, flag it in the
  report under "Needs follow-up" — do not re-audit the code yourself by
  reading source.
- The ONLY writes you may perform are to the report output path stated in
  the prompt (or \`<findingsDir>/../AUDIT-REPORT.md\` if no output path was
  given). Never write anywhere else.
- You do NOT need parent conversation history. Everything you need is in
  the finding files on disk.
- If the prompt does not clearly state a findings directory, STOP and
  \`set_output\` an error message instead of guessing or reading anything.

## Post-exec self-audit (REQUIRED before set_output)
Before you call \`set_output\`, review every tool call you made this turn and
confirm in the set_output message:
  - Every \`read_files\` call was inside the findings directory.
  - The only \`write_file\` call was to the report output path.
If any call violated the constraints above, report it explicitly in the
set_output message under a "Constraint violations" heading rather than
hiding it.

## Procedure
1. Parse the prompt for two paths: the findings directory and the report
   output path. If only the directory is given, write the report to
   \`<directory>/../AUDIT-REPORT.md\`. If neither is clearly present, STOP and
   set_output an error.
2. Use \`list_directory\` (or \`glob\` with pattern \`**/*.md\`) on the findings
   directory to enumerate all finding files.
3. \`read_files\` every finding file. Each file contains findings in this
   format:
   \`\`\`
   ## [SEVERITY] domain — file:line — short title
   - **Risk:** ...
   - **Fix:** ...
   - **Evidence:** ...
   \`\`\`
   Severity is one of CRITICAL / HIGH / MEDIUM / LOW.
4. Synthesize:
   a. De-duplicate findings reported by multiple shards for the same issue.
      Keep the one with the most specific file:line; note the duplicates.
   b. Group by domain (the 8 domains: Security, Correctness, State mutation,
      Error handling, Performance, Dependency hygiene, Test coverage gaps,
      API/ABI contract breaks). Within each domain, sort by severity
      (CRITICAL first, LOW last).
   c. Identify CROSS-CUTTING findings — issues that appear in 2+ shards or
      indicate a systemic pattern. These are usually the highest-impact.
      Put them in their own section near the top.
   d. Build a "Top 10" summary at the very top: the ten highest-leverage
      fixes across the whole audit, ranked. Each entry is one line with
      severity, domain, file, and a 6-word fix description.
   e. End with a "Coverage" section: list every shard/findings file you read
      and its finding count, so the user knows the audit's scope. If any
      shard file is missing or empty beyond a "No issues found" header,
      flag it.
5. \`write_file\` the report to the output path.
6. \`set_output\` with a one-paragraph summary (counts by severity + top
   cross-cutting themes) and the reportPath.

## Report format
The written report MUST follow this structure exactly:

\`\`\`markdown
# Audit Report — <repo/session>

Generated <ISO date>. Synthesized from <N> shard finding files.

## Top 10 highest-leverage fixes
1. [SEVERITY] domain — file — fix
... (10 lines)

## Cross-cutting findings (span multiple shards)
- ...

## Findings by domain

### Security
- [SEVERITY] file:line — title — Risk — Fix

### Correctness
- ...

### State mutation
- ...

### Error handling
- ...

### Performance
- ...

### Dependency hygiene
- ...

### Test coverage gaps
- ...

### API/ABI contract breaks
- ...

## Coverage
- <shard-file>: <finding-count> findings
- ...
- Total: <N> findings across <M> shards.

## Needs follow-up
- (anything unclear that a human or a re-audit should look at)
\`\`\`

Keep prose minimal. The report is a reference, not a narrative.
`.trim(),

  handleSteps: function* () {
    // One model step produces the report. The model reads findings via
    // list_directory/read_files and writes the report via write_file per the
    // instructionsPrompt, then set_output fires automatically in
    // structured_output mode. We yield STEP_ALL so the model can call multiple
    // tools (list -> read -> write -> set_output) in one turn.
    //
    // Security note: this agent is scoped to a findings directory by prompt,
    // not by a hardcoded read_files call (it yields STEP_ALL and lets the model
    // drive tools). The instructionsPrompt enforces the scope with hard rules
    // and a mandatory post-exec self-audit. A runtime-level path-confinement
    // hook for read_files would be stronger defense-in-depth but is not yet
    // plumbed through the agent runtime; tracked as a follow-up.
    yield 'STEP_ALL'
  },
}

export default definition
