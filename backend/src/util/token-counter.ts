import { encoding_for_model, TiktokenModel } from 'tiktoken'

export function countTokens(
  text: string,
  model: TiktokenModel = 'gpt-4o'
): number {
  try {
    const encoder = encoding_for_model(model)
    const tokens = encoder.encode(text)
    encoder.free()
    return tokens.length
  } catch (e) {
    console.error('Error counting tokens', e)
    return Math.ceil(text.length / 3)
  }
}

export function countTokensForFiles(
  files: Record<string, string | null>,
  model: TiktokenModel = 'gpt-4o'
): Record<string, number> {
  const tokenCounts: Record<string, number> = {}
  for (const [filePath, content] of Object.entries(files)) {
    tokenCounts[filePath] = content ? countTokens(content, model) : 0
  }
  return tokenCounts
}
