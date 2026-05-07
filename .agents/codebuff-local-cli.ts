import { createCliAgent } from './lib/create-cli-agent'

import type { AgentDefinition } from './types/agent-definition'

const baseDefinition = createCliAgent({
  id: 'codebuff-local-cli',
  displayName: 'Codebuff Local CLI',
  cliName: 'Codebuff',
  shortName: 'codebuff-local',
  startCommand: 'bun --cwd=cli run dev',
  permissionNote:
    'No permission flags needed for Codebuff local dev server.',
  model: 'anthropic/claude-opus-4.7',
  skipPrepPhase: true,
  cliSpecificDocs: `## Codebuff CLI Specific Guidance

- The ready state is the Codebuff banner, working directory, and bordered input box with the agent selector.
- For smoke tests, \`/help\` is useful because it validates the overlay, shortcuts, features, and credits copy in one step.
- For implementation-oriented tests, prefer asking the CLI to inspect or reason about a specific file rather than making edits unless the parent prompt explicitly asks for edits.
- Long Codebuff responses live in a scrollable viewport. If the bottom of the answer already shows the core recommendation, do not spend many extra steps trying to reconstruct every hidden line.
- Avoid key combinations like Shift+Arrow or repeated history/navigation probing unless you have a clear reason; they can open overlays or mutate the input state unexpectedly.
- A good implementation-test flow is usually: initial ready capture → task sent/in-progress capture → response-complete capture → optional follow-up-ready or follow-up-complete capture.
- If you need a follow-up, keep it narrow and specific rather than re-asking the whole task.
- If the current session becomes clearly unusable, report that failure; do not silently start a replacement session and continue as though nothing happened.`,
  spawnerPromptExtras: `**Purpose:** E2E visual testing of the Codebuff CLI itself. This agent starts a local dev Codebuff CLI instance and interacts with it to verify UI behavior.

**When to use:**
- After modifying \`cli/src/components/\` - UI components, layouts, rendering
- After modifying \`cli/src/hooks/\` - hooks that affect what users see
- To test CLI visual elements: borders, colors, spacing, text formatting
- To verify the CLI responds correctly to user input

**NOT for:**
- Code review or analysis tasks
- Reading files and verifying code logic
- Running unit tests or typechecks

**How it works:** Starts \`bun --cwd=cli run dev\` in tmux, then you send prompts/commands to the CLI and capture the visual output. Unit tests and typechecks cannot catch layout bugs, rendering issues, or visual regressions - this agent captures real terminal output including colors and layout.`,
})

// Constants must be inside handleSteps since it gets serialized via .toString()
const definition: AgentDefinition = {
  ...baseDefinition,
  handleSteps: function* ({ prompt, params, logger }) {
    const START_COMMAND = 'bun --cwd=cli run dev'
    const CLI_NAME = 'Codebuff'

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
          'Use this session for all CLI interactions. Treat it as the canonical session for this run. If it fails, report that explicitly instead of silently starting another session. The session name must be included in your final output.\n\n' +
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
