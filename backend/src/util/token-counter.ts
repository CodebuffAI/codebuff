import { LRUCache } from '@codebuff/common/util/lru-cache'
import { encode } from 'gpt-tokenizer/esm/model/gpt-4o'

const ANTHROPIC_TOKEN_FUDGE_FACTOR = 1.35

const TOKEN_COUNT_CACHE = new LRUCache<string, number>(1000)

export function countTokens(text: string): number {
  try {
    const cached = TOKEN_COUNT_CACHE.get(text)
    if (cached !== undefined) {
      return cached
    }
    const count = Math.floor(
      encode(text, { allowedSpecial: 'all' }).length *
        ANTHROPIC_TOKEN_FUDGE_FACTOR,
    )

    if (text.length > 100) {
      // Cache only if the text is long enough to be worth it.
      TOKEN_COUNT_CACHE.set(text, count)
    }
    return count
  } catch (e) {
    console.error('Error counting tokens', e)
    return Math.ceil(text.length / 3)
  }
}

export function countTokensJson(text: string | object): number {
  return countTokens(JSON.stringify(text))
}

export function countTokensForFiles(
  files: Record<string, string | null>,
): Record<string, number> {
  const tokenCounts: Record<string, number> = {}
  for (const [filePath, content] of Object.entries(files)) {
    tokenCounts[filePath] = content ? countTokens(content) : 0
  }
  return tokenCounts
}
