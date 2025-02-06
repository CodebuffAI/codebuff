import { sumBy } from 'lodash'

export const truncateString = (str: string, maxLength: number) => {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength) + '...'
}

export const truncateStringWithMessage = (
  str: string,
  maxLength: number,
  message: string = 'TRUNCATED_DUE_TO_LENGTH'
) => {
  return str.length > maxLength
    ? str.slice(0, maxLength) + `\n[...${message}]`
    : str
}

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
