import { Command } from 'commander'

import type { AgentMode } from './utils/constants'

export type ParsedArgs = {
  initialPrompt: string | null
  agent?: string
  clearLogs: boolean
  continue: boolean
  continueId?: string | null
  cwd?: string
  initialMode?: AgentMode
  trustProjectAgents: boolean
}

export function parseCliArgs(
  argv: string[],
  options: { version: string; exitOverride?: boolean },
): ParsedArgs {
  const program = new Command()
  program
    .name('openbuff')
    .description('Local/BYOK AI coding assistant')
    .version(options.version, '-v, --version', 'Print the CLI version')
    .option(
      '--agent <agent-id>',
      'Run a specific agent id (skips loading local .agents overrides)',
    )
    .option('--clear-logs', 'Remove any existing CLI log files before starting')
    .option(
      '--continue [conversation-id]',
      'Continue from a previous conversation (optionally specify a conversation id)',
    )
    .option(
      '--cwd <directory>',
      'Set the working directory (default: current directory)',
    )
    .option('--plan', 'Start in PLAN mode')
    .option('--local', 'Local/BYOK mode (default; kept for compatibility)')
    .option(
      '--trust-project-agents',
      'Allow executable agents and MCP config from this project or its parent directory',
    )
    .addHelpText(
      'after',
      '\nCommands:\n  init                           Create local project context',
    )
    .helpOption('-h, --help', 'Show this help message')
    .argument('[prompt...]', 'Initial prompt to send to the agent')
    .allowExcessArguments(true)
  if (options.exitOverride) program.exitOverride()
  program.parse(argv)

  const parsed = program.opts()
  const continueFlag = parsed.continue
  return {
    initialPrompt: program.args.length > 0 ? program.args.join(' ') : null,
    agent: parsed.agent,
    clearLogs: parsed.clearLogs || false,
    continue: Boolean(continueFlag),
    continueId:
      typeof continueFlag === 'string' && continueFlag.trim().length > 0
        ? continueFlag.trim()
        : null,
    cwd: parsed.cwd,
    initialMode: parsed.plan ? 'PLAN' : undefined,
    trustProjectAgents: parsed.trustProjectAgents === true,
  }
}
