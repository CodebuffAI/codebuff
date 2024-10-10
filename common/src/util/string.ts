import { sumBy } from 'lodash'

export const truncateString = (str: string, maxLength: number) => {
  if (str.length <= maxLength) {
    return str
  }
  return str.slice(0, maxLength) + '...'
}

export const replaceNonStandardPlaceholderComments = (
  content: string
): string => {
  const commentPatterns = [
    // C-style comments (C, C++, Java, JavaScript, TypeScript, etc.)
    {
      regex: /\/\/\s*\.{3}\s*.*(?:rest|unchanged|keep|file).*(?:\s*\.{3})?/gi,
      placeholder: '// ... existing code ...',
    },
    {
      regex:
        /\/\*\s*\.{3}\s*.*(?:rest|unchanged|keep|file).*(?:\s*\.{3})?\s*\*\//gi,
      placeholder: '/* ... existing code ... */',
    },
    // Python, Ruby, R comments
    {
      regex: /#\s*\.{3}\s*.*(?:rest|unchanged|keep|file).*(?:\s*\.{3})?/gi,
      placeholder: '# ... existing code ...',
    },
    // HTML-style comments
    {
      regex:
        /<!--\s*\.{3}\s*.*(?:rest|unchanged|keep|file).*(?:\s*\.{3})?\s*-->/gi,
      placeholder: '<!-- ... existing code ... -->',
    },
    // SQL, Haskell, Lua comments
    {
      regex: /--\s*\.{3}\s*.*(?:rest|unchanged|keep|file).*(?:\s*\.{3})?/gi,
      placeholder: '-- ... existing code ...',
    },
    // MATLAB comments
    {
      regex: /%\s*\.{3}\s*.*(?:rest|unchanged|keep|file).*(?:\s*\.{3})?/gi,
      placeholder: '% ... existing code ...',
    },
  ]

  let updatedContent = content

  for (const { regex, placeholder } of commentPatterns) {
    updatedContent = updatedContent.replace(regex, placeholder)
  }

  return updatedContent
}

export const randBoolFromStr = (str: string) => {
  return sumBy(str.split(''), (char) => char.charCodeAt(0)) % 2 === 0
}
