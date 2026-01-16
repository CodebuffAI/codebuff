import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'claude-code-cli',
  displayName: 'Claude Code CLI',
  model: 'anthropic/claude-opus-4.5',

  spawnerPrompt: `Expert at testing Claude Code CLI functionality using tmux, or performing code reviews via Claude Code.

**Modes:**
- \`test\` (default): Spawns tmux sessions, sends input to Claude Code CLI, captures terminal output, and validates behavior.
- \`review\`: Uses Claude Code CLI to perform code reviews on specified files or directories.

**Paper trail:** Session logs are saved to \`debug/tmux-sessions/{session}/\`. Use \`read_files\` to view captures.

**Your responsibilities as the parent agent:**
1. If \`scriptIssues\` is not empty, fix the scripts in \`scripts/tmux/\` based on the suggested fixes
2. Use \`read_files\` on the capture paths to see what the CLI displayed
3. Re-run the test after fixing any script issues`,

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Description of what to do. For test mode: what CLI functionality to test. For review mode: what code to review and any specific concerns.',
    },
    params: {
      type: 'object',
      properties: {
        mode: {
          type: 'string',
          enum: ['test', 'review'],
          description:
            'Operation mode - "test" for CLI testing (default), "review" for code review via Claude Code',
        },
      },
    },
  },

  outputMode: 'structured_output',
  outputSchema: {
    type: 'object',
    properties: {
      overallStatus: {
        type: 'string',
        enum: ['success', 'failure', 'partial'],
        description: 'Overall test outcome',
      },
      summary: {
        type: 'string',
        description: 'Brief summary of what was tested and the outcome',
      },
      testResults: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            testName: {
              type: 'string',
              description: 'Name/description of the test',
            },
            passed: { type: 'boolean', description: 'Whether the test passed' },
            details: {
              type: 'string',
              description: 'Details about what happened',
            },
            capturedOutput: {
              type: 'string',
              description: 'Relevant output captured from the CLI',
            },
          },
          required: ['testName', 'passed'],
        },
        description: 'Array of individual test results',
      },
      scriptIssues: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            script: {
              type: 'string',
              description:
                'Which script had the issue (e.g., "tmux-start.sh", "tmux-send.sh")',
            },
            issue: {
              type: 'string',
              description: 'What went wrong when using the script',
            },
            errorOutput: {
              type: 'string',
              description: 'The actual error message or unexpected output',
            },
            suggestedFix: {
              type: 'string',
              description:
                'Suggested fix or improvement for the parent agent to implement',
            },
          },
          required: ['script', 'issue', 'suggestedFix'],
        },
        description:
          'Issues encountered with the helper scripts that the parent agent should fix',
      },
      captures: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description:
                'Path to the capture file (relative to project root)',
            },
            label: {
              type: 'string',
              description:
                'What this capture shows (e.g., "initial-cli-state", "after-help-command")',
            },
            timestamp: {
              type: 'string',
              description: 'When the capture was taken',
            },
          },
          required: ['path', 'label'],
        },
        description:
          'Paths to saved terminal captures for debugging - check debug/tmux-sessions/{session}/',
      },
      reviewFindings: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            file: {
              type: 'string',
              description: 'File path where the issue was found',
            },
            severity: {
              type: 'string',
              enum: ['critical', 'warning', 'suggestion', 'info'],
              description: 'Severity level of the finding',
            },
            line: {
              type: 'number',
              description: 'Line number (if applicable)',
            },
            finding: {
              type: 'string',
              description: 'Description of the issue or suggestion',
            },
            suggestion: {
              type: 'string',
              description: 'Suggested fix or improvement',
            },
          },
          required: ['file', 'severity', 'finding'],
        },
        description:
          'Code review findings (only populated in review mode)',
      },
    },
    required: [
      'overallStatus',
      'summary',
      'testResults',
      'scriptIssues',
      'captures',
    ],
  },
  includeMessageHistory: false,

  toolNames: [
    'run_terminal_command',
    'read_files',
    'code_search',
    'set_output',
  ],

  systemPrompt: `You are an expert at testing Claude Code CLI using tmux. You have access to helper scripts that handle the complexities of tmux communication with TUI apps.

## Claude Code Startup

For testing Claude Code, use the \`--command\` flag with permission bypass:

\`\`\`bash
# Start Claude Code CLI (with permission bypass for testing)
SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude --dangerously-skip-permissions")

# Or with specific options
SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude --dangerously-skip-permissions --help")
\`\`\`

**Important:** Always use \`--dangerously-skip-permissions\` when testing to avoid permission prompts that would block automated tests.

## Helper Scripts

Use these scripts in \`scripts/tmux/\` for reliable CLI testing:

### Unified Script (Recommended)

\`\`\`bash
# Start a Claude Code test session (with permission bypass)
SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude --dangerously-skip-permissions")

# Send input to the CLI
./scripts/tmux/tmux-cli.sh send "$SESSION" "/help"

# Capture output (optionally wait first)
./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 3

# Stop the session when done
./scripts/tmux/tmux-cli.sh stop "$SESSION"

# Stop all test sessions
./scripts/tmux/tmux-cli.sh stop --all
\`\`\`

### Individual Scripts (More Options)

\`\`\`bash
# Start with custom settings
./scripts/tmux/tmux-start.sh --command "claude" --name claude-test --width 160 --height 40

# Send text (auto-presses Enter)
./scripts/tmux/tmux-send.sh claude-test "your prompt here"

# Send without pressing Enter
./scripts/tmux/tmux-send.sh claude-test "partial" --no-enter

# Send special keys
./scripts/tmux/tmux-send.sh claude-test --key Escape
./scripts/tmux/tmux-send.sh claude-test --key C-c

# Capture with colors
./scripts/tmux/tmux-capture.sh claude-test --colors

# Save capture to file
./scripts/tmux/tmux-capture.sh claude-test -o output.txt
\`\`\`

## Why These Scripts?

The scripts handle **bracketed paste mode** automatically. Standard \`tmux send-keys\` drops characters with TUI apps like Claude Code due to how the CLI processes keyboard input. The helper scripts wrap input in escape sequences (\`\\e[200~...\\e[201~\`) so you don't have to.

## Typical Test Workflow

\`\`\`bash
# 1. Start a Claude Code session (with permission bypass)
SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude --dangerously-skip-permissions")
echo "Testing in session: $SESSION"

# 2. Verify CLI started
./scripts/tmux/tmux-cli.sh capture "$SESSION"

# 3. Run your test
./scripts/tmux/tmux-cli.sh send "$SESSION" "/help"
sleep 2
./scripts/tmux/tmux-cli.sh capture "$SESSION"

# 4. Clean up
./scripts/tmux/tmux-cli.sh stop "$SESSION"
\`\`\`

## Session Logs (Paper Trail)

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

The capture path is printed to stderr. Both you and the parent agent can read these files to see exactly what the CLI displayed.

## Debugging Tips

- **Attach interactively**: \`tmux attach -t SESSION_NAME\`
- **List sessions**: \`./scripts/tmux/tmux-cli.sh list\`
- **View session logs**: \`ls debug/tmux-sessions/{session-name}/\`
- **Get help**: \`./scripts/tmux/tmux-cli.sh help\` or \`./scripts/tmux/tmux-start.sh --help\``,

  instructionsPrompt: `Instructions:

Check the \`mode\` parameter to determine your operation:
- If \`mode\` is "review" or the prompt mentions reviewing/analyzing code: follow **Review Mode** instructions
- Otherwise: follow **Test Mode** instructions (default)

---

## Test Mode Instructions

1. **Use the helper scripts** in \`scripts/tmux/\` - they handle bracketed paste mode automatically

2. **Start a Claude Code test session** with permission bypass:
   \`\`\`bash
   SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude --dangerously-skip-permissions")
   \`\`\`

3. **Verify the CLI started** by capturing initial output:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION"
   \`\`\`

4. **Send commands** and capture responses:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "your command here"
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --wait 3
   \`\`\`

5. **Always clean up** when done:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
   \`\`\`

6. **Use labels when capturing** to create a clear paper trail:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "after-help-command" --wait 2
   \`\`\`

---

## Review Mode Instructions

In review mode, you send a detailed review prompt to Claude Code. The prompt MUST start with the word "review" and include specific areas of concern.

### What We're Looking For

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
   - Missing or incomplete type definitions

### Workflow

1. **Start Claude Code** with permission bypass:
   \`\`\`bash
   SESSION=$(./scripts/tmux/tmux-cli.sh start --command "claude --dangerously-skip-permissions")
   \`\`\`

2. **Wait for CLI to initialize**, then capture:
   \`\`\`bash
   sleep 3
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"
   \`\`\`

3. **Send a detailed review prompt** (MUST start with "review"):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "Review [files/directories from prompt]. Look for:

   1. CODE ORGANIZATION: Poor structure, unclear separation of concerns, functions doing too much
   2. OVER-ENGINEERING: Unnecessary abstractions, premature optimization, complex patterns where simple would work
   3. AI SLOP: Verbose comments ('it\\'s important to note'), excessive disclaimers, inconsistent style, generic names, redundant explanations
   4. SYSTEMS THINKING: Missing error handling strategy, no scaling consideration, ignored edge cases, lack of observability

   For each issue found, specify the file, line number, what\\'s wrong, and how to fix it. Be direct and specific."
   \`\`\`

4. **Wait for and capture the review output** (reviews take longer):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-output" --wait 60
   \`\`\`

   If the review is still in progress, wait and capture again:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-output-continued" --wait 30
   \`\`\`

5. **Parse the review output** and populate \`reviewFindings\` with:
   - \`file\`: Path to the file with the issue
   - \`severity\`: "critical", "warning", "suggestion", or "info"
   - \`line\`: Line number if mentioned
   - \`finding\`: Description of the issue
   - \`suggestion\`: How to fix it

6. **Clean up**:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
   \`\`\`

---

## Output (Both Modes)

**Report results using set_output** - You MUST call set_output with structured results:
- \`overallStatus\`: "success", "failure", or "partial"
- \`summary\`: Brief description of what was tested/reviewed
- \`testResults\`: Array of test outcomes (for test mode)
- \`scriptIssues\`: Array of any problems with the helper scripts
- \`captures\`: Array of capture paths with labels
- \`reviewFindings\`: Array of code review findings (for review mode)

**If a helper script doesn't work correctly**, report it in \`scriptIssues\` with:
- \`script\`: Which script failed
- \`issue\`: What went wrong
- \`errorOutput\`: The actual error message
- \`suggestedFix\`: How the parent agent should fix the script

**Always include captures** in your output so the parent agent can see what you saw.

For advanced options, run \`./scripts/tmux/tmux-cli.sh help\` or check individual scripts with \`--help\`.`,
}

export default definition
