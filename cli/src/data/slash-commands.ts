import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import { AGENT_MODES } from '../utils/constants'

import type { SkillsMap } from '@codebuff/common/types/skill'


export interface SlashCommand {
  id: string
  label: string
  description: string
  aliases?: string[]
  /**
   * If true, this command can be invoked without a leading slash when the
   * input matches the command id exactly (no arguments).
   */
  implicitCommand?: boolean
  /**
   * If set, selecting this command inserts this text into the input field
   * instead of executing a command. Useful for agent shortcuts.
   */
  insertText?: string
}

// Generate mode commands from the AGENT_MODES constant.
const MODE_COMMANDS: SlashCommand[] = AGENT_MODES.map((mode) => ({
  id: `mode:${mode.toLowerCase()}`,
  label: `mode:${mode.toLowerCase()}`,
  description: `Switch to ${mode} mode`,
  aliases: [`model:${mode.toLowerCase()}`],
}))

const ALL_SLASH_COMMANDS: SlashCommand[] = [
  {
    id: 'info',
    label: 'info',
    description: 'Show CLI diagnostic information (version, workspace, auth)',
    aliases: ['status'],
  },
  {
    id: 'help',
    label: 'help',
    description: 'Display keyboard shortcuts and tips',
    aliases: ['h', '?'],
    implicitCommand: true,
  },
  ...(CHATGPT_OAUTH_ENABLED
    ? [
        {
          id: 'connect',
          label: 'connect',
          description: 'Connect your ChatGPT account',
          aliases: ['connect:chatgpt', 'chatgpt'],
        },
      ]
    : []),

  {
    id: 'init',
    label: 'init',
    description: 'Create a starter knowledge.md file',
    implicitCommand: true,
  },
  {
    id: 'setup',
    label: 'setup',
    description: 'Create or inspect a provider config',
  },
  {
    id: 'models',
    label: 'models',
    description: 'Show or configure mode, agent, and model routing',
  },
  {
    id: 'provider',
    label: 'provider',
    description: 'Show, add, remove, connect, or disconnect providers',
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
    id: 'interview',
    label: 'interview',
    description: 'AI asks a series of questions to flesh out request into a spec',
  },
  {
    id: 'plan',
    label: 'plan',
    description: 'Create a plan with GPT 5.4',
  },
  {
    id: 'resume-plan',
    label: 'resume-plan',
    description: 'Resume a durable plan session from STATUS.md / PLAN.md',
    aliases: ['rp'],
  },
  {
    id: 'update-plan',
    label: 'update-plan',
    description: 'Revise durable plan artifacts based on current reality',
    aliases: ['up'],
  },
  {
    id: 'plan-status',
    label: 'plan-status',
    description: 'Report concise status from durable plan artifacts',
    aliases: ['ps'],
  },
  {
    id: 'lessons',
    label: 'lessons',
    description: 'Create or update LESSONS.md for a durable plan session',
    aliases: ['lesson'],
  },
  {
    id: 'review',
    label: 'review',
    description: 'Review code changes with GPT 5.4',
  },
  {
    id: 'new',
    label: 'new',
    description: 'Clear the conversation history and start a new chat',
    aliases: ['n', 'clear', 'c', 'reset'],
    implicitCommand: true,
  },
  {
    id: 'history',
    label: 'history',
    description: 'Browse and resume past conversations',
    aliases: ['chats'],
  },
  {
    id: 'prompts',
    label: 'prompts',
    description: 'Fuzzy search past prompts',
    aliases: ['prompt-search'],
  },
  {
    id: 'agent:general',
    label: 'agent:general',
    description: 'Spawn the general agent to help solve complex problems',
    insertText: '@general-agent ',
  },
  {
    id: 'feedback',
    label: 'feedback',
    description: 'Share general feedback',
  },
  {
    id: 'bash',
    label: 'bash',
    description: 'Enter bash mode ("!" at beginning enters bash mode)',
    aliases: ['!'],
  },
  {
    id: 'diff',
    label: 'diff',
    description: 'Show unstaged git diff for the current project',
  },
  {
    id: 'changes',
    label: 'changes',
    description: 'Show git status (changed files) for the current project',
  },
  {
    id: 'image',
    label: 'image',
    description: 'Attach an image file (or Ctrl+V to paste from clipboard)',
    aliases: ['img', 'attach'],
  },
  ...MODE_COMMANDS,
  // {
  //   id: 'publish',
  //   label: 'publish',
  //   description: 'Publish agents to the agent store',
  // },
  {
    id: 'theme:toggle',
    label: 'theme:toggle',
    description: 'Toggle between light and dark mode',
  },
  {
    id: 'exit',
    label: 'exit',
    description: 'Quit the CLI',
    aliases: ['quit', 'q'],
    implicitCommand: true,
  },
]

export const SLASH_COMMANDS = ALL_SLASH_COMMANDS

export const SLASHLESS_COMMAND_IDS = new Set(
  SLASH_COMMANDS.filter((cmd) => cmd.implicitCommand).map((cmd) =>
    cmd.id.toLowerCase(),
  ),
)

/** Maximum description length for skill commands in the slash menu */
const SKILL_MENU_DESCRIPTION_MAX_LENGTH = 50

function truncateDescription(description: string): string {
  if (description.length <= SKILL_MENU_DESCRIPTION_MAX_LENGTH) {
    return description
  }
  return description.slice(0, SKILL_MENU_DESCRIPTION_MAX_LENGTH - 1) + '…'
}

/**
 * Returns SLASH_COMMANDS merged with skill commands.
 * Skills become slash commands that users can invoke directly.
 */
export function getSlashCommandsWithSkills(skills: SkillsMap): SlashCommand[] {
  const skillCommands: SlashCommand[] = Object.values(skills).map((skill) => ({
    id: `skill:${skill.name}`,
    label: `skill:${skill.name}`,
    description: truncateDescription(skill.description),
  }))

  return [...SLASH_COMMANDS, ...skillCommands]
}
