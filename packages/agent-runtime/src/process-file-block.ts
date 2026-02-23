import {
  promptSuccess,
  type PromptResult,
} from '@codebuff/common/util/error'
import { cleanMarkdownCodeBlock } from '@codebuff/common/util/file'
import { createPatch } from 'diff'

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

/**
 * Processes a file block, replacing the file content entirely or creating a new file.
 * This is fully deterministic — the content parameter is always written as-is.
 *
 * Returns a PromptResult wrapping the result:
 * - `{ aborted: false, value: WriteFileResult }` on success or recoverable error
 */
export async function processFileBlock(
  params: {
    path: string
    initialContentPromise: Promise<string | null>
    newContent: string
    logger: Logger
  },
): Promise<PromptResult<WriteFileResult>> {
  const {
    path,
    initialContentPromise,
    newContent,
    logger,
  } = params
  const initialContent = await initialContentPromise

  if (initialContent === null) {
    const cleanContent = cleanMarkdownCodeBlock(newContent)

    logger.debug(
      { path, cleanContent },
      `processFileBlock: Created new file ${path}`,
    )
    return promptSuccess({
      tool: 'write_file' as const,
      path,
      content: cleanContent,
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

  const lineEnding = initialContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedInitialContent = normalizeLineEndings(initialContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  let patch = createPatch(path, normalizedInitialContent, normalizedNewContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  } else {
    logger.debug(
      {
        path,
        initialContent,
        changes: newContent,
        patch,
      },
      `processFileBlock: No change to ${path}`,
    )
    return promptSuccess({
      tool: 'write_file' as const,
      path,
      error: 'The new content was the same as the old content, skipping.',
    })
  }
  logger.debug(
    {
      path,
      newContent,
      patch,
    },
    `processFileBlock: Updated file ${path}`,
  )

  const patchOriginalLineEndings = patch.replaceAll('\n', lineEnding)
  const updatedContentOriginalLineEndings = normalizedNewContent.replaceAll(
    '\n',
    lineEnding,
  )

  return promptSuccess({
    tool: 'write_file' as const,
    path,
    content: updatedContentOriginalLineEndings,
    patch: patchOriginalLineEndings,
    messages: [],
  })
}
