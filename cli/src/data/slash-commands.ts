import { AGENT_MODES } from '../utils/constants'

export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
}

// Generate mode commands from the AGENT_MODES constant
const MODE_COMMANDS: SlashCommand[] = AGENT_MODES.map((mode) => ({
  id: `mode:${mode.toLowerCase()}`,
  label: `mode:${mode.toLowerCase()}`,
  description: `Switch to ${mode} mode`,
}))

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'connect:claude',
    label: 'connect:claude',
    description: 'Connect your Claude Pro/Max subscription',
    aliases: ['claude'],
  },
  {
    id: 'init',
    label: 'init',
    description: 'Create a starter knowledge.md file',
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
  {
    id: 'chats',
    label: 'chats',
    description: 'View your chat history',
    aliases: ['history'],
  },
  {
    id: 'usage',
    label: 'usage',
    description: 'View credits and subscription quota',
    aliases: ['credits'],
  },
  {
    id: 'buy-credits',
    label: 'buy-credits',
    description: 'Open the usage page to buy credits',
  },
  {
    id: 'new',
    label: 'new',
    description: 'Start a fresh conversation session',
    aliases: ['n', 'clear', 'c', 'reset'],
  },
  {
    id: 'feedback',
    label: 'feedback',
    description: 'Share general feedback about Codebuff',
  },
  {
    id: 'bash',
    label: 'bash',
    description: 'Enter bash mode ("!" at beginning enters bash mode)',
    aliases: ['!'],
  },
  {
    id: 'image',
    label: 'image',
    description: 'Attach an image file (or Ctrl+V to paste from clipboard)',
    aliases: ['img', 'attach'],
  },
  {
    id: 'help',
    label: 'help',
    description: 'Display keyboard shortcuts and tips',
    aliases: ['h', '?'],
  },
  ...MODE_COMMANDS,
  {
    id: 'ads:enable',
    label: 'ads:enable (beta)',
    description: 'Enable contextual ads and earn credits',
  },
  {
    id: 'ads:disable',
    label: 'ads:disable (beta)',
    description: 'Disable contextual ads',
  },
  {
    id: 'referral',
    label: 'referral',
    description: 'Redeem a referral code for bonus credits',
    aliases: ['redeem'],
  },
  {
    id: 'publish',
    label: 'publish',
    description: 'Publish agents to the agent store',
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
]
