import { encoding_for_model, TiktokenModel } from 'tiktoken'

export function countTokens(
  text: string,
  model: TiktokenModel = 'gpt-4o'
): number {
  const encoder = encoding_for_model(model)
  const tokens = encoder.encode(text)
  encoder.free()
  return tokens.length
}

export function countTokensForFiles(
  files: Record<string, string>,
  model: TiktokenModel = 'gpt-4o'
): Record<string, number> {
  const tokenCounts: Record<string, number> = {}
  for (const [filePath, content] of Object.entries(files)) {
    tokenCounts[filePath] = countTokens(content, model)
  }
  return tokenCounts
}
