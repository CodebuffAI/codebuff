import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { Message, FileChange } from 'common/actions'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import {
  parseAndGetDiffBlocksSingleFile,
  retryDiffBlocksPrompt,
} from './generate-diffs-prompt'

export async function processFileBlock(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  ws: WebSocket,
  messageHistory: Message[],
  fullResponse: string,
  filePath: string,
  newContent: string,
  userId: string | undefined
): Promise<FileChange | null> {
  const oldContent = await requestFile(ws, filePath)

  if (oldContent === null) {
    logger.debug(
      { filePath, newContent },
      `processFileBlock: Created new file ${filePath}`
    )
    return { filePath, content: newContent, type: 'file' }
  }

  if (newContent === oldContent) {
    logger.info(
      { newContent },
      `processFileBlock: New was same as old, skipping ${filePath}`
    )
    return null
  }

  logger.debug({ filePath, newContent }, `processFileBlock: ${filePath}`)

  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  const { diffBlocks, diffBlocksThatDidntMatch } =
    parseAndGetDiffBlocksSingleFile(normalizedNewContent, normalizedOldContent)

  let fixedDiffBlocks: { searchContent: string; replaceContent: string }[] = []
  if (diffBlocksThatDidntMatch.length > 0) {
    fixedDiffBlocks = await retryDiffBlocksPrompt(
      filePath,
      normalizedOldContent,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      diffBlocksThatDidntMatch
    )
    diffBlocks.push(...fixedDiffBlocks)
  }

  const noDiffBlocks =
    diffBlocks.length === 0 && diffBlocksThatDidntMatch.length === 0
  let updatedContent = noDiffBlocks
    ? normalizedNewContent
    : normalizedOldContent
  for (const diffBlock of diffBlocks) {
    const { searchContent, replaceContent } = diffBlock
    updatedContent = updatedContent.replace(searchContent, replaceContent)
  }

  let patch = createPatch(filePath, normalizedOldContent, updatedContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  } else patch = ''
  patch = patch.replaceAll('\n', lineEnding)

  logger.debug(
    {
      filePath,
      oldContent,
      changes: newContent,
      patch,
      diffBlocks,
    },
    `processFileBlock: Generated patch for ${filePath}`
  )
  return { filePath, content: patch, type: 'patch' }
}
