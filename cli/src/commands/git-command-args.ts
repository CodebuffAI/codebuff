const FORBIDDEN_SHELL_CHARACTERS = /[\n\r;$`|&<>()[\]{}\\]/

/** Parse a small, non-expanding argument language for convenience git commands. */
export function parseSafeGitArgs(input: string): string[] {
  if (FORBIDDEN_SHELL_CHARACTERS.test(input)) {
    throw new Error('Shell operators and expansions are not allowed here.')
  }

  const args: string[] = []
  let current = ''
  let quote: 'single' | 'double' | null = null

  for (const character of input.trim()) {
    if (character === "'" && quote !== 'double') {
      quote = quote === 'single' ? null : 'single'
      continue
    }
    if (character === '"' && quote !== 'single') {
      quote = quote === 'double' ? null : 'double'
      continue
    }
    if (/\s/.test(character) && quote === null) {
      if (current) {
        args.push(current)
        current = ''
      }
      continue
    }
    current += character
  }

  if (quote !== null) {
    throw new Error('Unclosed quote in git arguments.')
  }
  if (current) args.push(current)
  return args
}

export const quoteShellArgument = (argument: string): string =>
  `'${argument.replaceAll("'", `'"'"'`)}'`

export function buildSafeGitCommand(
  subcommand: 'diff' | 'status',
  input: string,
  fallbackArgs: string[] = [],
): string {
  const args = input.trim() ? parseSafeGitArgs(input) : fallbackArgs
  return ['git', subcommand, ...args.map(quoteShellArgument)].join(' ')
}
