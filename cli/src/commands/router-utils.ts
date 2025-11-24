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
