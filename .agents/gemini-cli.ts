import { createCliAgent } from './lib/create-cli-agent'

import type { AgentDefinition } from './types/agent-definition'

const baseDefinition = createCliAgent({
  id: 'gemini-cli',
  displayName: 'Gemini CLI',
  cliName: 'Gemini',
  shortName: 'gemini',
  startCommand: 'gemini --yolo',
  permissionNote:
    'Always use `--yolo` (or `--approval-mode yolo`) when testing to auto-approve all tool actions and avoid prompts that would block automated tests.',
  model: 'anthropic/claude-opus-4.6',
  cliSpecificDocs: `## Gemini CLI Commands

Gemini CLI uses slash commands for navigation:
- \`/help\` - Show help information
- \`/tools\` - List available tools
- \`/quit\` - Exit the CLI (or Ctrl-C twice)`,
})

// Constants must be inside handleSteps since it gets serialized via .toString()
const definition: AgentDefinition = {
  ...baseDefinition,
  handleSteps: function* ({ prompt, params, logger }) {
    const START_COMMAND = 'gemini --yolo'
    const CLI_NAME = 'Gemini'

    yield {
      toolName: 'add_message',
      input: {
        role: 'assistant',
        content: 'I\'ll first gather context and prepare before starting the ' + CLI_NAME + ' CLI session.\n\n' +
          'Let me read relevant files and understand the task to provide better guidance to the CLI.',
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
        role: 'assistant',
        content: 'I have started a ' + CLI_NAME + ' tmux session: `' + sessionName + '`\n\n' +
          'I will use this session for all CLI interactions. The session name must be included in my final output.\n\n' +
          'Now I\'ll proceed with the task using the helper scripts:\n' +
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
