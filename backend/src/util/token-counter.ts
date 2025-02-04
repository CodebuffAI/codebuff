import { encode } from 'gpt-tokenizer/esm/model/gpt-4o'

const ANTHROPIC_TOKEN_FUDGE_FACTOR = 1.35

export function countTokens(text: string): number {
  try {
    return Math.floor(encode(text).length * ANTHROPIC_TOKEN_FUDGE_FACTOR)
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
