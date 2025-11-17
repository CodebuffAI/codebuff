export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
}

export const SLASH_COMMANDS: SlashCommand[] = [
  // {
  //   id: 'help',
  //   label: 'help',
  //   description: 'Display help information and available commands',
  //   aliases: ['h'],
  // },
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
    label: 'exit',
    description: 'Quit the CLI',
    aliases: ['quit', 'q'],
  },
  // {
  //   id: 'undo',
  //   label: 'undo',
  //   description: 'Undo the last change made by the assistant',
  // },
  // {
  //   id: 'redo',
  //   label: 'redo',
  //   description: 'Redo the most recent undone change',
  // },
  // {
  //   id: 'checkpoint',
  //   label: 'checkpoint',
  //   description: 'Restore the workspace to a specific checkpoint',
  // },
  {
    id: 'usage',
    label: 'usage',
    description: 'View remaining or bonus credits',
    aliases: ['credits'],
  },
  {
    id: 'new',
    label: 'new',
    description: 'Start a fresh conversation session',
    aliases: ['reset', 'clear'],
  },
  {
    id: 'feedback',
    label: 'feedback',
    description: 'Share general feedback about Codebuff',
  },
]
