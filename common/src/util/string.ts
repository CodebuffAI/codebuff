import { sumBy } from 'lodash'

export const truncateString = (str: string, maxLength: number) => {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength) + '...'
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

export const pluralize = (word: string, count: number) => {
  if (count === 1) return word

  // Handle words ending in 'y' (unless preceded by a vowel)
  if (word.endsWith('y') && !word.endsWith('ay')) {
    return word.slice(0, -1) + 'ies'
  }

  // Handle words ending in s, sh, ch, x, z
  if (word.match(/[sxz]$/) || word.match(/[cs]h$/)) {
    return word + 'es'
  }

  return word + 's'
}
