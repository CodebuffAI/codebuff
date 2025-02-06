import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { FileChange } from 'common/actions'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import { promptRelaceAI } from './relace-api'
import { cleanMarkdownCodeBlock } from 'common/util/file'
import { hasLazyEdit } from 'common/util/string'

export async function processFileBlock(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  ws: WebSocket,
  filePath: string,
  newContent: string,
  userId: string | undefined
): Promise<FileChange | null> {
  if (newContent.trim() === '[UPDATED_BY_ANOTHER_ASSISTANT]') {
    return null
  }

  const initialContent = await requestFile(ws, filePath)

  if (initialContent === null) {
    // Remove markdown code block syntax if present
    let cleanContent = cleanMarkdownCodeBlock(newContent)

    if (hasLazyEdit(cleanContent)) {
      logger.debug(
        { filePath, newContent },
        `processFileBlock: New file contained a lazy edit for ${filePath}. Aborting.`
      )
      return null
    }

    logger.debug(
      { filePath, cleanContent },
      `processFileBlock: Created new file ${filePath}`
    )
    return { filePath, content: cleanContent, type: 'file' }
  }

  if (newContent === initialContent) {
    logger.info(
      { newContent },
      `processFileBlock: New was same as old, skipping ${filePath}`
    )
    return null
  }

  const lineEnding = initialContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedInitialContent = normalizeLineEndings(initialContent)
  const normalizedEditSnippet = normalizeLineEndings(newContent)

  const updatedContent = await fastRewrite(
    normalizedInitialContent,
    normalizedEditSnippet,
    filePath,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId
  )

  let patch = createPatch(filePath, normalizedInitialContent, updatedContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  } else {
    logger.debug(
      {
        filePath,
        initialContent,
        changes: newContent,
        patch,
      },
      `processFileBlock: No change to ${filePath}`
    )
    return null
  }
  patch = patch.replaceAll('\n', lineEnding)

  logger.debug(
    {
      filePath,
      editSnippet: newContent,
      patch,
    },
    `processFileBlock: Generated patch for ${filePath}`
  )
  return { filePath, content: patch, type: 'patch' }
}

export async function fastRewrite(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const startTime = Date.now()

  const response = await promptRelaceAI(initialContent, editSnippet, {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })

  logger.debug(
    {
      initialContent,
      editSnippet,
      response,
      duration: Date.now() - startTime,
    },
    `fastRewrite of ${filePath}`
  )

  const cleanResponse = cleanMarkdownCodeBlock(response)

  // Add newline to maintain consistency with original file endings
  return cleanResponse + '\n'
}
