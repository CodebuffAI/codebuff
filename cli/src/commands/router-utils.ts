import { SLASHLESS_COMMAND_IDS } from '../data/slash-commands'

/**
 * Normalize user input by stripping the leading slash if present.
 * This is used for referral codes which work with or without the slash.
 *
 * @example
 * normalizeInput('/help') // => 'help'
 * normalizeInput('help')  // => 'help'
 * normalizeInput('/ref-abc123') // => 'ref-abc123'
 */
export function normalizeInput(input: string): string {
  return input.startsWith('/') ? input.slice(1) : input
}

/**
 * Check if the input is a slash command (starts with '/').
 *
 * @example
 * isSlashCommand('/help') // => true
 * isSlashCommand('help')  // => false
 * isSlashCommand('/ref-abc123') // => true
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
 * Check if the input is a referral code (starts with 'ref-').
 * Works with or without the leading slash.
 *
 * @example
 * isReferralCode('ref-abc123')  // => true
 * isReferralCode('/ref-abc123') // => true
 * isReferralCode('reference')   // => false
 */
export function isReferralCode(input: string): boolean {
  const normalized = normalizeInput(input.trim())
  return normalized.startsWith('ref-')
}

/**
 * Extract the referral code from user input.
 * Returns the normalized code without the leading slash.
 *
 * @example
 * extractReferralCode('/ref-abc123') // => 'ref-abc123'
 * extractReferralCode('ref-abc123')  // => 'ref-abc123'
 */
export function extractReferralCode(input: string): string {
  return normalizeInput(input.trim())
}

const REFERRAL_PREFIX = 'ref-'

/**
 * Normalize a referral code by ensuring it has the lowercase 'ref-' prefix.
 * Handles case-insensitive prefix detection (REF-, Ref-, etc.) and preserves
 * the original casing of the code portion.
 *
 * @example
 * normalizeReferralCode('abc123')      // => 'ref-abc123'
 * normalizeReferralCode('ref-abc123')  // => 'ref-abc123'
 * normalizeReferralCode('REF-ABC123')  // => 'ref-ABC123'
 * normalizeReferralCode('Ref-XYZ')     // => 'ref-XYZ'
 */
export function normalizeReferralCode(code: string): string {
  const trimmed = code.trim()
  const hasPrefix = trimmed.toLowerCase().startsWith(REFERRAL_PREFIX)
  const codeWithoutPrefix = hasPrefix
    ? trimmed.slice(REFERRAL_PREFIX.length)
    : trimmed
  return `${REFERRAL_PREFIX}${codeWithoutPrefix}`
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
