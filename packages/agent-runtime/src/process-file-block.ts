import { promptSuccess, type PromptResult } from '@codebuff/common/util/error'
import type { Logger } from '@codebuff/common/types/contracts/logger'

type WriteFileSuccess = {
  tool: 'write_file'
  path: string
  content: string
  patch: string | undefined
  messages: string[]
}

type WriteFileError = {
  tool: 'write_file'
  path: string
  error: string
}

export type WriteFileResult = WriteFileSuccess | WriteFileError

// Keep these aligned with the large-file thresholds in process-str-replace.ts.
const LARGE_FILE_LINE_THRESHOLD = 1_000
const LARGE_FILE_CHAR_THRESHOLD = 100_000
// A full-file overwrite that drops an existing large file below this fraction of
// its current size is the classic signature of editing from truncated context
// (the model only saw part of the file, then "rewrote" the whole thing). We
// block it to guarantee write_file never silently loses data on large files.
const LARGE_FILE_OVERWRITE_MIN_RATIO = 0.3

function isLargeFileContent(content: string): boolean {
  return (
    content.length > LARGE_FILE_CHAR_THRESHOLD ||
    content.replace(/\r\n/g, '\n').split('\n').length >
      LARGE_FILE_LINE_THRESHOLD
  )
}

/**
 * Detects a write_file overwrite that would drastically shrink an existing large
 * file (a strong truncated-context data-loss signal). Returns a recoverable
 * error message when the overwrite is unsafe, otherwise null.
 */
function describeUnsafeLargeFileOverwrite(params: {
  path: string
  initialContent: string
  newContent: string
}): string | null {
  const { path, initialContent, newContent } = params
  if (!isLargeFileContent(initialContent)) return null

  const normalize = (str: string) => str.replace(/\r\n/g, '\n')
  const initialLines = normalize(initialContent).split('\n').length
  const newLines = normalize(newContent).split('\n').length
  const lineRatio = newLines / initialLines
  const charRatio = newContent.length / Math.max(1, initialContent.length)

  if (
    lineRatio >= LARGE_FILE_OVERWRITE_MIN_RATIO &&
    charRatio >= LARGE_FILE_OVERWRITE_MIN_RATIO
  ) {
    return null
  }

  return [
    `write_file blocked for ${path}: this overwrite would shrink an existing large file from ${initialLines.toLocaleString()} lines (${initialContent.length.toLocaleString()} chars) to ${newLines.toLocaleString()} lines (${newContent.length.toLocaleString()} chars).`,
    'This drastic shrink usually means the new content was written from a truncated/partial view of the file, which would silently lose data.',
    'Recovery required: use str_replace (or edit_transaction) to change only the specific lines you intend to change. For large files, read the exact target range with read_files.ranges first, then edit. Whole-file write_file is intentionally blocked for drastic large-file shrinks because the runtime cannot prove the new content was derived from a complete, current file view.',
  ].join('\n')
}

/**
 * Processes a file block, replacing the file content entirely or creating a new file.
 * This is fully deterministic — the content parameter is always written as-is.
 *
 * Returns a PromptResult wrapping the result:
 * - `{ aborted: false, value: WriteFileResult }` on success or recoverable error
 */
export async function processFileBlock(params: {
  path: string
  initialContentPromise: Promise<string | null>
  newContent: string
  logger: Logger
}): Promise<PromptResult<WriteFileResult>> {
  const { path, initialContentPromise, newContent, logger } = params
  const initialContent = await initialContentPromise

  if (initialContent === null) {
    logger.debug(
      { path, newContent },
      `processFileBlock: Created new file ${path}`,
    )
    return promptSuccess({
      tool: 'write_file' as const,
      path,
      content: newContent,
      patch: undefined,
      messages: [`Created new file ${path}`],
    })
  }

  if (newContent === initialContent) {
    logger.info(
      { newContent },
      `processFileBlock: New was same as old, skipping ${path}`,
    )
    return promptSuccess({
      tool: 'write_file' as const,
      path,
      error: 'The new content was the same as the old content, skipping.',
    })
  }

  const unsafeOverwrite = describeUnsafeLargeFileOverwrite({
    path,
    initialContent,
    newContent,
  })
  if (unsafeOverwrite) {
    logger.warn(
      { path },
      `processFileBlock: Blocked unsafe large-file overwrite ${path}`,
    )
    return promptSuccess({
      tool: 'write_file' as const,
      path,
      error: unsafeOverwrite,
    })
  }

  logger.debug(
    {
      path,
      newContent,
    },
    `processFileBlock: Updated file ${path}`,
  )

  return promptSuccess({
    tool: 'write_file' as const,
    path,
    content: newContent,
    // Whole-file writes are sent as full content so caller-supplied bytes stay
    // authoritative; generating/applying a text patch could normalize them.
    patch: undefined,
    messages: [],
  })
}
