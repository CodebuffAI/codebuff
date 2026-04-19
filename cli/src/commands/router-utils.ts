import { SLASHLESS_COMMAND_IDS } from '../data/slash-commands'

/**
 * Check if the input is a slash command (starts with '/').
 *
 * @example
 * isSlashCommand('/help') // => true
 * isSlashCommand('help')  // => false
 */
export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/')
}

/**
 * Parse the command name from user input.
 * ONLY works for slash commands (input starting with '/').
 * Returns empty string if the input is not a slash command.
 *
 * @example
 * parseCommand('/help') // => 'help'
 * parseCommand('/LOGOUT') // => 'logout'
 * parseCommand('/usage stats') // => 'usage'
 * parseCommand('help') // => '' (not a slash command)
 * parseCommand('logout') // => '' (not a slash command)
 */
export function parseCommand(input: string): string {
  const trimmed = input.trim()
  if (!trimmed.startsWith('/')) {
    return ''
  }
  const normalized = trimmed.slice(1)
  const firstWord = normalized.split(/\s+/)[0] || ''
  return firstWord.toLowerCase()
}

/**
 * Result of parsing a command-like input.
 */
export type ParsedCommandInput = {
  command: string
  args: string
  implicitCommand: boolean
}

/**
 * Parse a command from user input.
 * Supports:
 * - Standard slash commands: "/command args"
 * - Slashless exact commands: "init" (only if configured)
 *
 * Returns null when the input should be treated as a normal message.
 *
 * @example
 * parseCommandInput('/help') // => { command: 'help', args: '', implicitCommand: false }
 * parseCommandInput('/usage stats') // => { command: 'usage', args: 'stats', implicitCommand: false }
 * parseCommandInput('init') // => { command: 'init', args: '', implicitCommand: true }
 * parseCommandInput('init something') // => null
 */
export function parseCommandInput(input: string): ParsedCommandInput | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('/')) {
    const command = parseCommand(trimmed)
    if (!command) return null
    const args = trimmed.slice(1 + command.length).trim()
    return { command, args, implicitCommand: false }
  }

  if (/\s/.test(trimmed)) {
    return null
  }

  const normalized = trimmed.toLowerCase()
  if (!SLASHLESS_COMMAND_IDS.has(normalized)) {
    return null
  }

  return { command: normalized, args: '', implicitCommand: true }
}
