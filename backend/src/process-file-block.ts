import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { Message, FileChange } from 'common/actions'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import {
  parseAndGetDiffBlocksSingleFile,
  retryDiffBlocksPrompt,
} from './generate-diffs-prompt'
import { openaiModels } from 'common/constants'
import { promptOpenAI } from './openai-api'

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
    // Remove markdown code block syntax if present
    let cleanContent = newContent
      .replace(/^```[^\n]*\n/, '')
      .replace(/\n```$/, '')

    const { diffBlocks } = parseAndGetDiffBlocksSingleFile(cleanContent, '')
    if (diffBlocks.length > 0) {
      const content = diffBlocks.map((block) => block.replaceContent).join('\n')
      logger.debug(
        { filePath, content },
        `processFileBlock: Created new file from replace blocks ${filePath}`
      )
      return { filePath, content, type: 'file' }
    }
    logger.debug(
      { filePath, cleanContent },
      `processFileBlock: Created new file ${filePath}`
    )
    return { filePath, content: cleanContent, type: 'file' }
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

  let updatedDiffBlocksThatDidntMatch: {
    searchContent: string
    replaceContent: string
  }[] = []
  if (diffBlocksThatDidntMatch.length > 0) {
    const { newDiffBlocks, newDiffBlocksThatDidntMatch } =
      await retryDiffBlocksPrompt(
        filePath,
        normalizedOldContent,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        diffBlocksThatDidntMatch
      )
    diffBlocks.push(...newDiffBlocks)

    updatedDiffBlocksThatDidntMatch = newDiffBlocksThatDidntMatch
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

  if (updatedDiffBlocksThatDidntMatch.length > 0) {
    updatedContent = await applyRemainingChanges(
      updatedContent,
      updatedDiffBlocksThatDidntMatch,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    )
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

async function applyRemainingChanges(
  updatedContent: string,
  diffBlocksThatDidntMatch: { searchContent: string; replaceContent: string }[],
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const prompt = `
Here's the current content of the file:

\`\`\`
${updatedContent}
\`\`\`

The following changes were intended but could not be applied using exact string matching:

${diffBlocksThatDidntMatch
  .map(
    (block, i) => `
Change ${i + 1}:
Search content:
\`\`\`${block.searchContent}\`\`\`

Replace with:
\`\`\`${block.replaceContent}\`\`\`
`
  )
  .join('\n')}

Please rewrite the file content to include these intended changes while preserving the rest of the file. Only make the minimal changes necessary to incorporate the intended edits. Do not edit any other code. Please preserve all other comments, etc.

Return only the full, complete file content with no additional text or explanation without using \`\`\` markdown code blocks. Start with the first line of the file instead. Do not excerpt portions of the file, write out the entire updated file.`

  const response = await promptOpenAI([{ role: 'user', content: prompt }], {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: openaiModels.gpt4o,
    predictedContent: updatedContent,
  })

  logger.debug(
    { response, diffBlocksThatDidntMatch },
    `applyRemainingChanges for ${diffBlocksThatDidntMatch.length} blocks`
  )

  // Extract content from within code blocks
  const match = response.match(/```(?:\w*\n)?([\s\S]*?)```/)
  return match ? match[1] : response
}
