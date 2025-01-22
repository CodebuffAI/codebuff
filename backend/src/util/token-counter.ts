import { encode } from 'gpt-tokenizer/esm/model/gpt-4o'

export function countTokens(text: string): number {
  try {
    return encode(text).length
  } catch (e) {
    console.error('Error counting tokens', e)
    return Math.ceil(text.length / 3)
  }
}

export function countTokensJson(text: string | object): number {
  return countTokens(JSON.stringify(text))
}

export function countTokensForFiles(
  files: Record<string, string | null>
): Record<string, number> {
  const tokenCounts: Record<string, number> = {}
  for (const [filePath, content] of Object.entries(files)) {
    tokenCounts[filePath] = content ? countTokens(content) : 0
  }
  return tokenCounts
}
