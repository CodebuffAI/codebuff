import { FILE_READ_STATUS } from '../constants/paths'

/** Maximum source characters returned by one read_files tool call. */
export const MAX_READ_FILES_CHARS = 100_000

/** Maximum estimated tokens returned by one read_files tool call. */
export const MAX_READ_FILES_TOKENS = 20_000

/** Small chunks avoid pathological BPE runtimes on repetitive Unicode. */
const TOKEN_CHUNK_CHARS = 1_024

type LimitedFileRead = {
  content: string
  includedChars: number
  includedTokens: number
}

type FileReadLimiterOptions = {
  /** A conservative local token estimator, including any desired safety factor. */
  countTokens?: (text: string) => number
}

function avoidSplittingSurrogatePair(text: string, end: number): number {
  if (
    end > 0 &&
    end < text.length &&
    text.charCodeAt(end - 1) >= 0xd800 &&
    text.charCodeAt(end - 1) <= 0xdbff
  ) {
    return end - 1
  }
  return end
}

function limitContentByTokens(
  content: string,
  tokenBudget: number,
  countTokens: (text: string) => number,
): { chars: number; tokens: number; truncated: boolean } {
  let chars = 0
  let tokens = 0

  while (chars < content.length) {
    let chunkEnd = Math.min(chars + TOKEN_CHUNK_CHARS, content.length)
    chunkEnd = avoidSplittingSurrogatePair(content, chunkEnd)
    if (chunkEnd === chars) chunkEnd++

    const chunk = content.slice(chars, chunkEnd)
    const chunkTokens = countTokens(chunk)
    if (tokens + chunkTokens <= tokenBudget) {
      chars = chunkEnd
      tokens += chunkTokens
      continue
    }
    // Keep only complete, independently verified chunks. This can leave less
    // than one chunk of budget unused, but avoids costly exact-prefix fitting.
    return { chars, tokens, truncated: true }
  }

  return { chars, tokens, truncated: false }
}

function limitFileReadContent(
  content: string,
  remainingChars: number,
  remainingTokens: number,
  countTokens?: (text: string) => number,
): LimitedFileRead {
  const charLimit = Math.min(content.length, Math.max(0, remainingChars))
  const safeCharLimit = avoidSplittingSurrogatePair(content, charLimit)
  const charLimitedContent = content.slice(0, safeCharLimit)
  const tokenBudget = Math.max(0, remainingTokens)
  const tokenLimit = countTokens
    ? limitContentByTokens(charLimitedContent, tokenBudget, countTokens)
    : {
        chars: charLimitedContent.length,
        tokens: 0,
        truncated: false,
      }
  const includedChars = tokenLimit.chars
  const includedTokens = tokenLimit.tokens

  if (includedChars === content.length) {
    return { content, includedChars, includedTokens }
  }

  let notice: string
  if (tokenLimit.truncated) {
    const hitAggregateLimit = remainingTokens < MAX_READ_FILES_TOKENS
    notice = hitAggregateLimit
      ? `${FILE_READ_STATUS.TOO_LARGE}: The combined read_files output exceeded the ${MAX_READ_FILES_TOKENS.toLocaleString()} estimated-token limit. This file was truncated after ${includedTokens.toLocaleString()} estimated tokens. Read it separately or use code_search for the relevant section.`
      : `${FILE_READ_STATUS.TOO_LARGE}: This file exceeded the ${MAX_READ_FILES_TOKENS.toLocaleString()} estimated-token per-file limit. It was truncated after ${includedTokens.toLocaleString()} estimated tokens. Use code_search or a more targeted read for the relevant section.`
  } else {
    const hitAggregateLimit = remainingChars < MAX_READ_FILES_CHARS
    notice = hitAggregateLimit
      ? `${FILE_READ_STATUS.TOO_LARGE}: The combined read_files output exceeded the ${MAX_READ_FILES_CHARS.toLocaleString()} character hard limit. This file was truncated after ${includedChars.toLocaleString()} characters. Read it separately or use code_search for the relevant section.`
      : `${FILE_READ_STATUS.TOO_LARGE}: This file is ${content.length.toLocaleString()} characters, exceeding the ${MAX_READ_FILES_CHARS.toLocaleString()} character hard limit. The content above has been truncated. Use code_search or a more targeted read for the relevant section.`
  }

  return {
    content:
      includedChars === 0
        ? notice
        : `${content.slice(0, includedChars)}\n\n${notice}`,
    includedChars,
    includedTokens,
  }
}

/**
 * Creates an ordered limiter for one read_files invocation. Status/error
 * messages should bypass this limiter so they do not consume the content
 * budget.
 */
export function createFileReadLimiter(options: FileReadLimiterOptions = {}) {
  let remainingChars = MAX_READ_FILES_CHARS
  let remainingTokens = MAX_READ_FILES_TOKENS

  return {
    limit(content: string): string {
      const limited = limitFileReadContent(
        content,
        remainingChars,
        remainingTokens,
        options.countTokens,
      )
      remainingChars -= limited.includedChars
      remainingTokens -= limited.includedTokens
      return limited.content
    },
  }
}
