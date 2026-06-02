/**
 * Comprehensive shell argument escaping for bash commands.
 *
 * This function provides production-ready escaping to prevent:
 * - Command injection attacks
 * - API key leaks through command manipulation
 * - Breaking command structure with special characters
 * - Unicode and multi-byte character issues
 * - Quote breaking and command repetition
 *
 * Uses double-quote escaping which is more robust than single-quote escaping
 * for handling complex inputs including Unicode, newlines, and special characters.
 *
 * @param prompt - The string to escape for safe use in bash commands
 * @returns A safely escaped string wrapped in double quotes
 */
export function escapeShellArg(prompt: string): string {
  // Comprehensive escaping for bash double quotes - production ready
  // Order matters: backslashes must be escaped FIRST before other characters
  const escaped = prompt
    .replace(/\\/g, "\\\\") // Escape backslashes FIRST (prevents escape sequence injection)
    .replace(/"/g, '\\"') // Escape double quotes (prevents quote breaking)
    .replace(/'/g, "'\\''") // Escape single quotes (close quote, escaped quote, reopen)
    .replace(/\$/g, "\\$") // Escape dollar signs (prevents variable expansion)
    .replace(/`/g, "\\`") // Escape backticks (prevents command substitution)
    .replace(/!/g, "\\!") // Escape exclamation (prevents history expansion)
    .replace(/\n/g, "\\n") // Escape newlines (prevents command line breaking)
    .replace(/\r/g, "\\r") // Escape carriage returns (prevents line ending issues)
    .replace(/\t/g, "\\t"); // Escape tabs (prevents whitespace issues)

  // Wrap in double quotes for final safety
  // Double quotes allow variable expansion but we've escaped $, so it's safe
  return `"${escaped}"`;
}

/**
 * Escape shell argument using single-quote wrapping for maximum security.
 * Single quotes prevent ALL variable expansion and command substitution.
 *
 * This is the most secure method when you don't need variable expansion.
 *
 * @param prompt - The string to escape for safe use in bash commands
 * @returns A safely escaped string wrapped in single quotes
 */
export function escapeShellArgSingleQuotes(prompt: string): string {
  // First escape all special characters comprehensively
  const escaped = prompt
    .replace(/\\/g, "\\\\") // Escape backslashes FIRST
    .replace(/'/g, "'\\''") // Escape single quotes (close quote, escaped quote, reopen)
    .replace(/\n/g, "\\n") // Escape newlines
    .replace(/\r/g, "\\r") // Escape carriage returns
    .replace(/\t/g, "\\t"); // Escape tabs

  // Wrap in single quotes (prevents ALL expansion and substitution)
  return `'${escaped}'`;
}

/**
 * Escape shell argument for use in double-quoted strings.
 * This is used when the argument will be placed inside double quotes.
 *
 * @param prompt - The string to escape
 * @returns Escaped string ready for double-quote wrapping
 */
export function escapeForDoubleQuotes(prompt: string): string {
  // Comprehensive escaping for bash double quotes - production ready
  return prompt
    .replace(/\\/g, "\\\\") // Escape backslashes FIRST
    .replace(/"/g, '\\"') // Escape double quotes
    .replace(/\$/g, "\\$") // Escape dollar signs
    .replace(/`/g, "\\`") // Escape backticks (command substitution)
    .replace(/!/g, "\\!") // Escape exclamation (history expansion)
    .replace(/\n/g, "\\n") // Escape newlines
    .replace(/\r/g, "\\r") // Escape carriage returns
    .replace(/\t/g, "\\t"); // Escape tabs
  // Note: Single quotes don't need escaping inside double quotes
}
