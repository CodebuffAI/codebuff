import { AGENT_MODES } from '../utils/constants'

export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
  /**
   * If true, this command will NOT auto-execute when Tab is pressed with only one match.
   * Use for dangerous commands that require explicit Enter to execute.
   */
  noTabAutoExecute?: boolean
}

// Generate mode commands from the AGENT_MODES constant
const MODE_COMMANDS: SlashCommand[] = AGENT_MODES.map((mode) => ({
  id: `mode:${mode.toLowerCase()}`,
  label: `mode:${mode.toLowerCase()}`,
  description: `Switch to ${mode} mode`,
}))

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
    noTabAutoExecute: true,
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
    aliases: ['n', 'clear', 'c'],
  },
  {
    id: 'feedback',
    label: 'feedback',
    description: 'Share general feedback about Codebuff',
    aliases: ['bug', 'report'],
  },
  {
    id: 'bash',
    label: 'bash',
    description: 'Enter bash mode ("!" at beginning enters bash mode)',
    aliases: ['!'],
  },
  {
    id: 'referral',
    label: 'referral',
    description: 'Redeem a referral code for bonus credits',
    aliases: ['redeem'],
  },
  {
    id: 'image',
    label: 'image',
    description: 'Attach an image file (or Ctrl+V to paste from clipboard)',
    aliases: ['img', 'attach'],
  },
  {
    id: 'publish',
    label: 'publish',
    description: 'Publish agents to the agent store',
  },
  ...MODE_COMMANDS,
]
