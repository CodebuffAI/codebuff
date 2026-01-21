import type { CliAgentConfig } from './cli-agent-types'
import { CLI_AGENT_MODES } from './cli-agent-types'

const TMUX_SESSION_DOCS = `## Session Logs (Paper Trail)

All session data is stored in **YAML format** in \`debug/tmux-sessions/{session-name}/\`:

- \`session-info.yaml\` - Session metadata (start time, dimensions, status)
- \`commands.yaml\` - YAML array of all commands sent with timestamps
- \`capture-{sequence}-{label}.txt\` - Captures with YAML front-matter

\`\`\`bash
# Capture with a descriptive label (recommended)
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "after-help-command" --wait 2

# Capture saved to: debug/tmux-sessions/{session}/capture-001-after-help-command.txt
\`\`\`

Each capture file has YAML front-matter with metadata:
\`\`\`yaml
---
sequence: 1
label: after-help-command
timestamp: 2025-01-01T12:00:30Z
after_command: "/help"
dimensions:
  width: 120
  height: 30
---
[terminal content]
\`\`\`

The capture path is printed to stderr. Both you and the parent agent can read these files to see exactly what the CLI displayed.`

const TMUX_DEBUG_TIPS = `## Debugging Tips

- **Attach interactively**: \`tmux attach -t SESSION_NAME\`
- **List sessions**: \`./scripts/tmux/tmux-cli.sh list\`
- **View session logs**: \`ls debug/tmux-sessions/{session-name}/\`
- **Get help**: \`./scripts/tmux/tmux-cli.sh help\` or \`./scripts/tmux/tmux-start.sh --help\``

const REVIEW_CRITERIA = `### What We're Looking For

The review should focus on these key areas:

1. **Code Organization Issues**
   - Poor file/module structure
   - Unclear separation of concerns
   - Functions/classes that do too many things
   - Missing or inconsistent abstractions

2. **Over-Engineering & Complexity**
   - Unnecessarily abstract or generic code
   - Premature optimization
   - Complex patterns where simple solutions would suffice
   - "Enterprise" patterns in small codebases

3. **AI-Generated Code Patterns ("AI Slop")**
   - Verbose, flowery language in comments ("It's important to note...", "Worth mentioning...")
   - Excessive disclaimers and hedging in documentation
   - Inconsistent coding style within the same file
   - Overly generic variable/function names
   - Redundant explanatory comments that just restate the code
   - Sudden shifts between formal and casual tone
   - Filler phrases that add no value

4. **Lack of Systems-Level Thinking**
   - Missing error handling strategy
   - No consideration for scaling or performance
   - Ignoring edge cases and failure modes
   - Lack of observability (logging, metrics, tracing)
   - Missing or incomplete type definitions`

export function getSpawnerPrompt(config: CliAgentConfig): string {
  const defaultMode = config.defaultMode ?? 'work'
  const modeDescriptions = {
    work: `Use ${config.cliName} to implement features, fix bugs, refactor code, or complete other coding tasks.`,
    review: `Uses ${config.cliName} CLI to perform code reviews on specified files or directories.`,
  }
  const modeLines = CLI_AGENT_MODES.map(mode => {
    const isDefault = mode === defaultMode
    return `- \`${mode}\`${isDefault ? ' (default)' : ''}: ${modeDescriptions[mode]}`
  }).join('\n')

  const base = `Expert at using ${config.cliName} CLI via tmux for implementation work or code reviews.

**Modes:**
${modeLines}

**Paper trail:** Session logs are saved to \`debug/tmux-sessions/{session}/\`. Use \`read_files\` to view captures.

**Your responsibilities as the parent agent:**
1. If \`scriptIssues\` is not empty, fix the scripts in \`scripts/tmux/\` based on the suggested fixes
2. Use \`read_files\` on the capture paths to see what the CLI displayed
3. Re-run the agent after fixing any script issues`

  return config.spawnerPromptExtras ? `${base}\n\n${config.spawnerPromptExtras}` : base
}

export function getSystemPrompt(config: CliAgentConfig): string {
  const cliSpecificSection = config.cliSpecificDocs ? `\n${config.cliSpecificDocs}\n` : '\n'

  return `You are an expert at using ${config.cliName} CLI via tmux for implementation work and code reviews. You have access to helper scripts that handle the complexities of tmux communication with TUI apps.

## Session Management

**A tmux session is started for you automatically.** The session name will be announced in an assistant message. Use that session name (stored in \`$SESSION\`) for all subsequent commands.

**Do NOT start a new session** - use the one that was started for you.

**Important:** ${config.permissionNote}
${cliSpecificSection}
## Helper Scripts

Use these scripts in \`scripts/tmux/\` to interact with the CLI session:

\`\`\`bash
# Send input to the CLI
./scripts/tmux/tmux-cli.sh send "$SESSION" "/help"

# Capture output (optionally wait first)
./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 3

# Capture with a descriptive label
./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "after-task" --wait 5

# Stop the session when done
./scripts/tmux/tmux-cli.sh stop "$SESSION"
\`\`\`

### Additional Options

\`\`\`bash
# Send without pressing Enter
./scripts/tmux/tmux-send.sh "$SESSION" "partial" --no-enter

# Send special keys
./scripts/tmux/tmux-send.sh "$SESSION" --key Escape
./scripts/tmux/tmux-send.sh "$SESSION" --key C-c

# Capture with colors
./scripts/tmux/tmux-capture.sh "$SESSION" --colors
\`\`\`

## Why These Scripts?

The scripts handle **bracketed paste mode** automatically. Standard \`tmux send-keys\` drops characters with TUI apps like ${config.cliName} due to how the CLI processes keyboard input. The helper scripts wrap input in escape sequences (\`\\e[200~...\\e[201~\`) so you don't have to.

${TMUX_SESSION_DOCS}

${TMUX_DEBUG_TIPS}`
}

export function getDefaultReviewModeInstructions(config: CliAgentConfig): string {
  const isDefault = config.defaultMode === 'review'
  return `## Review Mode Instructions${isDefault ? ' (Default)' : ''}

In review mode, you send a detailed review prompt to ${config.cliName}. The prompt MUST start with the word "review" and include specific areas of concern.

${REVIEW_CRITERIA}

### Workflow

**Note:** A tmux session will be started for you automatically after your preparation phase. Use the session name from the assistant message that announces it.

1. **Wait for CLI to initialize**, then capture:
   \`\`\`bash
   sleep 3
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"
   \`\`\`

2. **Send a detailed review prompt** (MUST start with "review"):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "Review [files/directories from prompt]. Look for:

   1. CODE ORGANIZATION: Poor structure, unclear separation of concerns, functions doing too much
   2. OVER-ENGINEERING: Unnecessary abstractions, premature optimization, complex patterns where simple would work
   3. AI SLOP: Verbose comments ('it\\'s important to note'), excessive disclaimers, inconsistent style, generic names, redundant explanations
   4. SYSTEMS THINKING: Missing error handling strategy, no scaling consideration, ignored edge cases, lack of observability

   For each issue found, specify the file, line number, what's wrong, and how to fix it. Be direct and specific."
   \`\`\`

3. **Wait for and capture the review output** (reviews take longer):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-output" --wait 60
   \`\`\`

   If the review is still in progress, wait and capture again:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-output-continued" --wait 30
   \`\`\`

4. **Parse the review output** and populate \`reviewFindings\` with:
   - \`file\`: Path to the file with the issue
   - \`severity\`: "critical", "warning", "suggestion", or "info"
   - \`line\`: Line number if mentioned
   - \`finding\`: Description of the issue
   - \`suggestion\`: How to fix it

5. **Clean up**:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
   \`\`\``
}

export function getWorkModeInstructions(config: CliAgentConfig): string {
  const isDefault = (config.defaultMode ?? 'work') === 'work'
  return `## Work Mode Instructions${isDefault ? ' (Default)' : ''}

Use ${config.cliName} to complete implementation tasks like building features, fixing bugs, or refactoring code.

### Workflow

**Note:** A tmux session will be started for you automatically after your preparation phase. Use the session name from the assistant message that announces it.

1. **Wait for CLI to initialize**, then capture:
   \`\`\`bash
   sleep 3
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"
   \`\`\`

2. **Send your task** (from the prompt you received) to the CLI:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "<the task from your prompt parameter>"
   \`\`\`

   Use the exact task description from the prompt the parent agent gave you.

3. **Wait for completion and capture output** (implementation tasks may take a while):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "work-in-progress" --wait 30
   \`\`\`

   If the work is still in progress, wait and capture again:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "work-continued" --wait 30
   \`\`\`

4. **Send follow-up prompts** if needed to refine or continue the work:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "<follow-up instructions>"
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "follow-up" --wait 30
   \`\`\`

5. **Verify the changes** by checking files or running commands:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "run the tests to verify the changes"
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "verification" --wait 60
   \`\`\`

6. **Clean up** when done:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
   \`\`\`

### Tips

- Break complex tasks into smaller prompts
- Capture frequently to track progress
- Use descriptive labels for captures
- Check intermediate results before moving on`
}

export function getInstructionsPrompt(config: CliAgentConfig): string {
  const defaultMode = config.defaultMode ?? 'work'
  const workModeInstructions = config.workModeInstructions ?? getWorkModeInstructions(config)
  const reviewModeInstructions = config.reviewModeInstructions ?? getDefaultReviewModeInstructions(config)

  const modeNames = { work: 'Work Mode', review: 'Review Mode' }
  const nonDefaultModes = CLI_AGENT_MODES.filter(m => m !== defaultMode)
  const modeChecks = nonDefaultModes.map(m => `- If \`mode\` is "${m}": follow **${modeNames[m]}** instructions`).join('\n')

  const workflowSection = config.skipPrepPhase
    ? `## Workflow

**A tmux session is started for you immediately.** An assistant message will announce the session name. **Do NOT start a new session** - use the one provided.`
    : `## Two-Phase Workflow

This agent operates in two phases:

### Phase 1: Preparation (Current Phase)
You have an opportunity to prepare before the CLI session starts. Use this time to:
- Read relevant files to understand the codebase
- Search for code patterns or implementations
- Understand the task requirements
- Gather context that will help you guide the CLI effectively

After your preparation turn, a tmux session will be started automatically.

### Phase 2: CLI Execution
Once the session starts, an assistant message will announce the session name. **Do NOT start a new session** - use the one provided.`

  return `Instructions:

${workflowSection}

Check the \`mode\` parameter to determine your operation:
${modeChecks}
- Otherwise: follow **${modeNames[defaultMode]}** instructions (default)

---

${workModeInstructions}

---

${reviewModeInstructions}

---

## Output (All Modes)

**Report results using set_output** - You MUST call set_output with structured results:
- \`overallStatus\`: "success", "failure", or "partial"
- \`summary\`: Brief description of what was done
- \`sessionName\`: The tmux session name (REQUIRED - from the session started for you)
- \`results\`: Array of task outcomes (for work mode)
- \`scriptIssues\`: Array of any problems with the helper scripts
- \`captures\`: Array of capture paths with labels (MUST have at least one capture)
- \`reviewFindings\`: Array of code review findings (for review mode)

**If a helper script doesn't work correctly**, report it in \`scriptIssues\` with:
- \`script\`: Which script failed
- \`issue\`: What went wrong
- \`errorOutput\`: The actual error message
- \`suggestedFix\`: How to fix the script

**Always include captures** in your output so the parent agent can see what you saw.

For advanced options, run \`./scripts/tmux/tmux-cli.sh help\` or check individual scripts with \`--help\`.`
}
