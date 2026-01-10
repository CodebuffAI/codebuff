import type { AgentDefinition } from './types/agent-definition'

const definition: AgentDefinition = {
  id: 'cli-ui-tester',
  displayName: 'CLI UI Tester',
  model: 'anthropic/claude-opus-4.5',

  spawnerPrompt: `Expert at testing Codebuff CLI functionality using tmux.

**Use this agent after modifying:**
- \`cli/src/components/\` - UI components, layouts, rendering
- \`cli/src/hooks/\` - hooks that affect what users see
- Any CLI visual elements: borders, colors, spacing, text formatting

**When to use:** After implementing CLI UI changes, use this to verify the visual output actually renders correctly. Unit tests and typechecks cannot catch layout bugs, rendering issues, or visual regressions. This agent captures real terminal output including colors and layout.

**What it does:** Spawns tmux sessions, sends input to the CLI, captures terminal output, and validates behavior.

**Paper trail:** Session logs are saved to \`debug/tmux-sessions/{session}/\`. Use \`read_files\` to view captures.

**Your responsibilities as the parent agent:**
1. If \`scriptIssues\` is not empty, fix the scripts in \`scripts/tmux/\` based on the suggested fixes
2. Use \`read_files\` on the capture paths to see what the CLI displayed
3. Re-run the test after fixing any script issues`,

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'Description of what CLI functionality to test (e.g., "test that the help command displays correctly", "verify authentication flow works")',
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

  systemPrompt: `You are an expert at testing the Codebuff CLI using tmux. You have access to helper scripts that handle the complexities of tmux communication with the CLI.

## Helper Scripts

Use these scripts in \`scripts/tmux/\` for reliable CLI testing:

### Unified Script (Recommended)

\`\`\`bash
# Start a test session (returns session name)
SESSION=$(./scripts/tmux/tmux-cli.sh start)

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
./scripts/tmux/tmux-start.sh --name my-test --width 160 --height 40

# Send text (auto-presses Enter)
./scripts/tmux/tmux-send.sh my-test "your prompt here"

# Send without pressing Enter
./scripts/tmux/tmux-send.sh my-test "partial" --no-enter

# Send special keys
./scripts/tmux/tmux-send.sh my-test --key Escape
./scripts/tmux/tmux-send.sh my-test --key C-c

# Capture with colors
./scripts/tmux/tmux-capture.sh my-test --colors

# Save capture to file
./scripts/tmux/tmux-capture.sh my-test -o output.txt
\`\`\`

## Why These Scripts?

The scripts handle **bracketed paste mode** automatically. Standard \`tmux send-keys\` drops characters with the Codebuff CLI due to how OpenTUI processes keyboard input. The helper scripts wrap input in escape sequences (\`\\e[200~...\\e[201~\`) so you don't have to.

## Typical Test Workflow

\`\`\`bash
# 1. Start a session
SESSION=$(./scripts/tmux/tmux-cli.sh start)
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

## Viewing Session Data

Use the **tmux-viewer** to inspect session data interactively or as JSON:

\`\`\`bash
# Interactive TUI (for humans)
bun .agents/tmux-viewer/index.tsx "$SESSION"

# JSON output (for AIs) - includes all captures, commands, and timeline
bun .agents/tmux-viewer/index.tsx "$SESSION" --json

# List available sessions
bun .agents/tmux-viewer/index.tsx --list
\`\`\`

The viewer parses all YAML data (session-info.yaml, commands.yaml, capture front-matter) and presents it in a unified format.

## Debugging Tips

- **Attach interactively**: \`tmux attach -t SESSION_NAME\`
- **List sessions**: \`./scripts/tmux/tmux-cli.sh list\`
- **View session logs**: \`ls debug/tmux-sessions/{session-name}/\`
- **Get help**: \`./scripts/tmux/tmux-cli.sh help\` or \`./scripts/tmux/tmux-start.sh --help\``,

  instructionsPrompt: `Instructions:

1. **Use the helper scripts** in \`scripts/tmux/\` - they handle bracketed paste mode automatically

2. **Start a test session**:
   \`\`\`bash
   SESSION=$(./scripts/tmux/tmux-cli.sh start)
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

7. **Report results using set_output** - You MUST call set_output with structured results:
   - \`overallStatus\`: "success", "failure", or "partial"
   - \`summary\`: Brief description of what was tested
   - \`testResults\`: Array of test outcomes with testName, passed (boolean), details, capturedOutput
   - \`scriptIssues\`: Array of any problems with the helper scripts (IMPORTANT for the parent agent!)
   - \`captures\`: Array of capture paths with labels (e.g., {path: "debug/tmux-sessions/cli-test-123/capture-...", label: "after-help"})

8. **If a helper script doesn't work correctly**, report it in \`scriptIssues\` with:
   - \`script\`: Which script failed (e.g., "tmux-send.sh")
   - \`issue\`: What went wrong
   - \`errorOutput\`: The actual error message
   - \`suggestedFix\`: How the parent agent should fix the script

   The parent agent CAN edit the scripts - you cannot. Your job is to identify issues clearly.

9. **Always include captures** in your output so the parent agent can see what you saw.

For advanced options, run \`./scripts/tmux/tmux-cli.sh help\` or check individual scripts with \`--help\`.`,
}

export default definition
