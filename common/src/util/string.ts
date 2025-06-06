import { sumBy } from 'lodash'

export const truncateString = (str: string, maxLength: number) => {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength) + '...'
}

export const truncateStringWithMessage = ({
  str,
  maxLength,
  message = 'TRUNCATED DUE TO LENGTH',
  remove = 'END',
}: {
  str: string
  maxLength: number
  message?: string
  remove?: 'END' | 'START' | 'MIDDLE'
}) => {
  if (str.length <= maxLength) {
    return str
  }

  if (remove === 'END') {
    const suffix = `\n[${message}...]`
    return str.slice(0, maxLength - suffix.length) + suffix
  }
  if (remove === 'START') {
    const prefix = `[...${message}]\n`
    return prefix + str.slice(str.length - maxLength + prefix.length)
  }

  const middle = `\n[...${message}...]\n`
  const length = Math.floor((maxLength - middle.length) / 2)
  return str.slice(0, length) + middle + str.slice(-length)
}

/**
 * Check if a character is a whitespace character according
 * to the XML spec (space, carriage return, line feed or tab)
 *
 * @param character Character to check
 * @return Whether the character is whitespace or not
 */
export const isWhitespace = (character: string) => /\s/.test(character)

export const replaceNonStandardPlaceholderComments = (
  content: string,
  replacement: string
): string => {
  const commentPatterns = [
    // JSX comments (match this first)
    {
      regex:
        /{\s*\/\*\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?\s*\*\/\s*}/gi,
      placeholder: replacement,
    },
    // C-style comments (C, C++, Java, JavaScript, TypeScript, etc.)
    {
      regex:
        /\/\/\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?/gi,
      placeholder: replacement,
    },
    {
      regex:
        /\/\*\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?\s*\*\//gi,
      placeholder: replacement,
    },
    // Python, Ruby, R comments
    {
      regex:
        /#\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?/gi,
      placeholder: replacement,
    },
    // HTML-style comments
    {
      regex:
        /<!--\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?\s*-->/gi,
      placeholder: replacement,
    },
    // SQL, Haskell, Lua comments
    {
      regex:
        /--\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?/gi,
      placeholder: replacement,
    },
    // MATLAB comments
    {
      regex:
        /%\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\s*\.{3})?/gi,
      placeholder: replacement,
    },
  ]

  let updatedContent = content

  for (const { regex, placeholder } of commentPatterns) {
    updatedContent = updatedContent.replaceAll(regex, placeholder)
  }

  return updatedContent
}

export const randBoolFromStr = (str: string) => {
  return sumBy(str.split(''), (char) => char.charCodeAt(0)) % 2 === 0
}

export const pluralize = (count: number, word: string) => {
  if (count === 1) return `${count} ${word}`

  // Handle words ending in 'y' (unless preceded by a vowel)
  if (word.endsWith('y') && !word.match(/[aeiou]y$/)) {
    return `${count} ${word.slice(0, -1) + 'ies'}`
  }

  // Handle words ending in s, sh, ch, x, z, o
  if (word.match(/[sxz]$/) || word.match(/[cs]h$/) || word.match(/o$/)) {
    return `${count} ${word + 'es'}`
  }

  // Handle words ending in f/fe
  if (word.endsWith('f')) {
    return `${count} ${word.slice(0, -1) + 'ves'}`
  }
  if (word.endsWith('fe')) {
    return `${count} ${word.slice(0, -2) + 'ves'}`
  }

  return `${count} ${word + 's'}`
}

/**
 * Safely replaces all occurrences of a search string with a replacement string,
 * escaping special replacement patterns (like $) in the replacement string.
 */
export const capitalize = (str: string): string => {
  if (!str) return str
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase()
}

/**
 * Converts a snake_case string to Title Case
 * Example: "add_subgoal" -> "Add Subgoal"
 */
export const snakeToTitleCase = (str: string): string => {
  return str
    .split('_')
    .map((word) => capitalize(word))
    .join(' ')
}

/**
 * Ensures a URL has the appropriate protocol (http:// or https://)
 * Uses http:// for localhost and local IPs, https:// for all other domains
 */
export const ensureUrlProtocol = (url: string): string => {
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url
  }

  if (url.startsWith('localhost') || url.match(/^127\.\d+\.\d+\.\d+/)) {
    return `http://${url}`
  }

  return `https://${url}`
}

export const safeReplace = (
  content: string,
  searchStr: string,
  replaceStr: string
): string => {
  const escapedReplaceStr = replaceStr.replace(/\$/g, '$$$$')
  return content.replace(searchStr, escapedReplaceStr)
}

export const hasLazyEdit = (content: string) => {
  const cleanedContent = content.toLowerCase().trim()
  return (
    cleanedContent.includes('... existing code ...') ||
    cleanedContent.includes('// rest of the') ||
    cleanedContent.includes('# rest of the') ||
    // Match various comment styles with ellipsis and specific words
    /\/\/\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?/.test(
      cleanedContent
    ) || // C-style single line
    /\/\*\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?\s*\*\//.test(
      cleanedContent
    ) || // C-style multi-line
    /#\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?/.test(
      cleanedContent
    ) || // Python/Ruby style
    /<!--\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?\s*-->/.test(
      cleanedContent
    ) || // HTML style
    /--\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?/.test(
      cleanedContent
    ) || // SQL/Haskell style
    /%\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?/.test(
      cleanedContent
    ) || // MATLAB style
    /{\s*\/\*\s*\.{3}.*(?:rest|unchanged|keep|file|existing|some).*(?:\.{3})?\s*\*\/\s*}/.test(
      cleanedContent
    ) // JSX style
  )
}

/**
 * Extracts a JSON field from a string, transforms it, and puts it back.
 * Handles both array and object JSON values.
 * @param content The string containing JSON-like content
 * @param field The field name to find and transform
 * @param transform Function to transform the parsed JSON value
 * @param fallback String to use if parsing fails
 * @returns The content string with the transformed JSON field
 */
export const transformJsonInString = <T = unknown>(
  content: string,
  field: string,
  transform: (json: T) => unknown,
  fallback: string
): string => {
  // Use a non-greedy match for objects/arrays to prevent over-matching
  const pattern = new RegExp(`"${field}"\\s*:\\s*(\\{[^}]*?\\}|\\[[^\\]]*?\\])`)
  const match = content.match(pattern)

  if (!match) {
    return content
  }

  try {
    const json = JSON.parse(match[1])
    const transformed = transform(json)

    // Important: Only replace the exact matched portion to prevent duplicates
    return content.replace(
      match[0],
      `"${field}":${JSON.stringify(transformed)}`
    )
  } catch (error) {
    // Only replace the exact matched portion even in error case
    return content.replace(match[0], `"${field}":${fallback}`)
  }
}

/**
 * Generates a compact unique identifier by combining timestamp bits with random bits.
 * Takes last 24 bits of timestamp (enough for months) and 8 random bits.
 * Encodes in base36 for very compact strings (~5-6 chars).
 * @param prefix Optional prefix to add to the ID
 * @returns A unique string ID
 * @example
 * generateCompactId()      // => "1a2b3c"
 * generateCompactId('msg-') // => "msg-1a2b3c"
 */
export const generateCompactId = (prefix?: string): string => {
  const timestamp = Date.now() & 0xffffff // Last 24 bits of timestamp
  const random = Math.floor(Math.random() * 0xff) // 8 random bits
  const str = ((timestamp << 8) | random).toString(36).replace(/^-/, '') // Remove leading dash if present
  return prefix ? `${prefix}${str}` : str
}

/**
 * Removes null characters from a string
 */
export const stripNullChars = (str: string): string => {
  return str.replace(/\u0000/g, '')
}

const ansiColorsRegex = /\x1B\[[0-9;]*m/g
export function stripColors(str: string): string {
  return str.replace(ansiColorsRegex, '')
}

const ansiRegex = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x1B]*\x1B\\?)/g
export function stripAnsi(str: string): string {
  return str.replace(ansiRegex, '')
}

export function includesMatch(
  array: (string | RegExp)[],
  value: string
): boolean {
  return array.some((p) => {
    if (typeof p === 'string') {
      return p === value
    }
    return p.test(value)
  })
}

/**
 * Finds the longest substring that is **both** a suffix of `source`
 * **and** a prefix of `next`.
 * Useful when concatenating strings while avoiding duplicate overlap.
 *
 * @example
 * ```ts
 * suffixPrefixOverlap('foobar', 'barbaz'); // ➜ 'bar'
 * suffixPrefixOverlap('abc', 'def');       // ➜ ''
 * ```
 *
 * @param source  The string whose **suffix** is inspected.
 * @param next    The string whose **prefix** is inspected.
 * @returns       The longest overlapping edge, or an empty string if none exists.
 */
export function suffixPrefixOverlap(source: string, next: string): string {
  for (let len = next.length; len > 0; len--) {
    const prefix = next.slice(0, len)
    if (source.endsWith(prefix)) {
      return prefix
    }
  }

  return ''
}
