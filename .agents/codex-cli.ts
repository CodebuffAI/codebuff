import { createCliAgent } from './lib/create-cli-agent'

import type { AgentDefinition } from './types/agent-definition'

/**
 * Codex-specific review mode instructions.
 * Codex CLI has a built-in /review command with an interactive questionnaire.
 */
const CODEX_REVIEW_MODE_INSTRUCTIONS = `## Review Mode Instructions

Codex CLI has a built-in \`/review\` command that presents an interactive questionnaire. You must navigate it using arrow keys and Enter.

**Note:** A tmux session will be started for you automatically after your preparation phase. Use the session name from the assistant message that announces it.

### Review Type Mapping

The \`reviewType\` param maps to menu options (1-indexed from top):
- \`"pr"\` → Option 1: "Review against a base branch (PR Style)"
- \`"uncommitted"\` → Option 2: "Review uncommitted changes" (default)
- \`"commit"\` → Option 3: "Review a commit"
- \`"custom"\` → Option 4: "Custom review instructions"

### Workflow

1. **Wait for CLI to initialize**, then capture:
   \`\`\`bash
   sleep 3
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "initial-state"
   \`\`\`

2. **Send the /review command**:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "/review"
   sleep 2
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-menu"
   \`\`\`

3. **Navigate to the correct option** using arrow keys:
   - The menu starts with Option 1 selected (PR Style)
   - Use Down arrow to move to the desired option:
     - \`reviewType="pr"\`: No navigation needed, just press Enter
     - \`reviewType="uncommitted"\`: Send Down once, then Enter
     - \`reviewType="commit"\`: Send Down twice, then Enter
     - \`reviewType="custom"\`: Send Down three times, then Enter
   
   \`\`\`bash
   # Example for "uncommitted" (option 2):
   ./scripts/tmux/tmux-send.sh "$SESSION" --key Down
   sleep 0.5
   ./scripts/tmux/tmux-send.sh "$SESSION" --key Enter
   \`\`\`

4. **For "custom" reviewType**, after selecting option 4, you'll need to send the custom instructions from the prompt:
   \`\`\`bash
   sleep 1
   ./scripts/tmux/tmux-cli.sh send "$SESSION" "[custom instructions from the prompt]"
   \`\`\`

5. **Wait for and capture the review output** (reviews take longer):
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh capture "$SESSION" --label "review-output" --wait 60
   \`\`\`

6. **Parse the review output** and populate \`reviewFindings\` with:
   - \`file\`: Path to the file with the issue
   - \`severity\`: "critical", "warning", "suggestion", or "info"
   - \`line\`: Line number if mentioned
   - \`finding\`: Description of the issue
   - \`suggestion\`: How to fix it

7. **Clean up**:
   \`\`\`bash
   ./scripts/tmux/tmux-cli.sh stop "$SESSION"
   \`\`\``

const baseDefinition = createCliAgent({
  id: 'codex-cli',
  displayName: 'Codex CLI',
  cliName: 'Codex',
  shortName: 'codex',
  startCommand: 'codex -a never -s danger-full-access',
  permissionNote:
    'Always use `-a never -s danger-full-access` when testing to avoid approval prompts that would block automated tests.',
  model: 'anthropic/claude-opus-4.6',
  extraInputParams: {
    reviewType: {
      type: 'string',
      enum: ['pr', 'uncommitted', 'commit', 'custom'],
      description:
        'For review mode: "pr" = Review against base branch (PR style), "uncommitted" = Review uncommitted changes, "commit" = Review a specific commit, "custom" = Custom review instructions. Defaults to "uncommitted".',
    },
  },
  reviewModeInstructions: CODEX_REVIEW_MODE_INSTRUCTIONS,
})

// Constants must be inside handleSteps since it gets serialized via .toString()
const definition: AgentDefinition = {
  ...baseDefinition,
  handleSteps: function* ({ prompt, params, logger }) {
    const START_COMMAND = 'codex -a never -s danger-full-access'
    const CLI_NAME = 'Codex'

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content: 'Before starting the ' + CLI_NAME + ' CLI session, gather context by reading relevant files and understanding the task to provide better guidance to the CLI.',
      },
      includeToolCall: false,
    }

    yield 'STEP'

    logger.info('Starting ' + CLI_NAME + ' tmux session...')

    const { toolResult } = yield {
      toolName: 'run_terminal_command',
      input: {
        command: './scripts/tmux/tmux-cli.sh start --command "' + START_COMMAND + '"',
        timeout_seconds: 30,
      },
    }

    // Parse response from tmux-cli.sh (outputs plain session name on success, error to stderr on failure)
    let sessionName = ''
    let parseError = ''

    const result = toolResult?.[0]
    if (result && result.type === 'json') {
      const value = result.value as Record<string, unknown>
      const stdout = typeof value?.stdout === 'string' ? value.stdout.trim() : ''
      const stderr = typeof value?.stderr === 'string' ? value.stderr.trim() : ''
      const exitCode = typeof value?.exitCode === 'number' ? value.exitCode : undefined

      if (!stdout && !stderr) {
        parseError = 'tmux-cli.sh returned empty output'
      } else if (exitCode !== 0 || !stdout) {
        parseError = stderr || 'tmux-cli.sh failed with no error message'
      } else {
        sessionName = stdout
      }
    } else {
      parseError = 'Unexpected result type from run_terminal_command'
    }

    if (!sessionName) {
      const errorMsg = parseError || 'Session name was empty'
      logger.error({ parseError: errorMsg }, 'Failed to start tmux session')
      yield {
        toolName: 'set_output',
        input: {
          overallStatus: 'failure',
          summary: 'Failed to start ' + CLI_NAME + ' tmux session. ' + errorMsg,
          sessionName: '',
          scriptIssues: [
            {
              script: 'tmux-cli.sh',
              issue: errorMsg,
              errorOutput: JSON.stringify(toolResult),
              suggestedFix: 'Ensure tmux-cli.sh outputs the session name to stdout and exits with code 0. Check that tmux is installed.',
            },
          ],
          captures: [],
        },
      }
      return
    }

    logger.info('Successfully started tmux session: ' + sessionName)

    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content: 'A ' + CLI_NAME + ' tmux session has been started: `' + sessionName + '`\n\n' +
          'Use this session for all CLI interactions. The session name must be included in your final output.\n\n' +
          'Proceed with the task using the helper scripts:\n' +
          '- Send commands: `./scripts/tmux/tmux-cli.sh send "' + sessionName + '" "..."`\n' +
          '- Capture output: `./scripts/tmux/tmux-cli.sh capture "' + sessionName + '" --label "..."`\n' +
          '- Stop when done: `./scripts/tmux/tmux-cli.sh stop "' + sessionName + '"`',
      },
      includeToolCall: false,
    }

    yield 'STEP_ALL'
  },
}

export default definition
