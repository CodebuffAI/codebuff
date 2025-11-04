export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
}

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'help',
    label: 'help',
    description: 'Display help information and available commands',
    aliases: ['h'],
  },
  {
    id: 'init',
    label: 'init',
    description: 'Configure project for better results',
  },
  {
    id: 'logout',
    label: 'logout',
    description: 'Sign out of your session',
    aliases: ['signout'],
  },
  {
    id: 'exit',
    label: 'exit (quit)',
    description: 'Quit the CLI',
    aliases: ['quit', 'q'],
  },
  {
    id: 'diff',
    label: 'diff',
    description: 'Show the diff for the last assistant change',
    aliases: ['d'],
  },
  {
    id: 'undo',
    label: 'undo',
    description: 'Undo the last change made by the assistant',
  },
  {
    id: 'redo',
    label: 'redo',
    description: 'Redo the most recent undone change',
  },
  {
    id: 'checkpoint',
    label: 'checkpoint',
    description: 'Restore the workspace to a specific checkpoint',
  },
  {
    id: 'usage',
    label: 'usage (credits)',
    description: 'View remaining or bonus AI credits',
    aliases: ['credits'],
  },
  {
    id: 'new',
    label: 'new (reset, clear)',
    description: 'Start a fresh conversation session',
    aliases: ['reset', 'clear'],
  },
  {
    id: 'compact',
    label: 'compact',
    description: 'Summarize conversation history to free context',
  },
  {
    id: 'export',
    label: 'export',
    description: 'Export the current conversation summary to a file',
  },
  {
    id: 'ask',
    label: 'ask',
    description: "Switch to ask mode (won't modify code)",
  },
  {
    id: 'lite',
    label: 'lite',
    description: 'Switch to lite mode (faster and cheaper)',
  },
  {
    id: 'normal',
    label: 'normal',
    description: 'Switch to normal mode (balanced behavior)',
  },
  {
    id: 'max',
    label: 'max',
    description: 'Switch to max mode (thorough responses)',
  },
  {
    id: 'trace',
    label: 'trace',
    description: 'Show the trace list or view a specific trace',
    aliases: ['traces'],
  },
  {
    id: 'agents',
    label: 'agents',
    description: 'Manage custom agent templates locally',
  },
]
