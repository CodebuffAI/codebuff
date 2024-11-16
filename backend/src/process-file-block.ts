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
import { createSearchReplaceBlock } from 'common/util/file'
import { promptRelaceAI } from './relace-api'

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
  if (newContent.trim() === '[UPDATED_BY_ANOTHER_ASSISTANT]') {
    return null
  } else if (newContent.trim().startsWith('@@')) {
    // Note: Can remove this case in a bit. It stops content that was supposed to be a patch.
    return null
  }
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
  }[] = [...diffBlocks, ...diffBlocksThatDidntMatch]
  // if (diffBlocksThatDidntMatch.length > 0) {
  //   const { newDiffBlocks, newDiffBlocksThatDidntMatch } =
  //     await retryDiffBlocksPrompt(
  //       filePath,
  //       normalizedOldContent,
  //       clientSessionId,
  //       fingerprintId,
  //       userInputId,
  //       userId,
  //       diffBlocksThatDidntMatch
  //     )
  //   diffBlocks.push(...newDiffBlocks)

  //   updatedDiffBlocksThatDidntMatch = newDiffBlocksThatDidntMatch
  // }

  const noDiffBlocks =
    diffBlocks.length === 0 && diffBlocksThatDidntMatch.length === 0
  let updatedContent = noDiffBlocks
    ? normalizedNewContent
    : normalizedOldContent
  // for (const diffBlock of diffBlocks) {
  //   const { searchContent, replaceContent } = diffBlock
  //   updatedContent = updatedContent.replace(searchContent, replaceContent)
  // }

  if (updatedDiffBlocksThatDidntMatch.length > 0) {
    updatedContent = await applyRemainingChanges(
      updatedContent,
      updatedDiffBlocksThatDidntMatch,
      fullResponse,
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
  } else {
    logger.debug(
      {
        filePath,
        oldContent,
        changes: newContent,
        patch,
        diffBlocks,
      },
      `processFileBlock: No change to ${filePath}`
    )
    return null
  }
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
  fullResponse: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
) {
  const prompt = `
You will be helping to rewrite a file with changes.

Here is the context for the change:
<assistant_thoughts>
${fullResponse}
</assistant_thoughts>

Here's the current content of the file:

\`\`\`
${updatedContent}
\`\`\`

The following changes were intended for this file but could not be applied using exact string matching. Note that the changes are represented as SEARCH strings found in the current file that are intended to be replaced with the REPLACE strings. Often the SEARCH string will contain extra lines of context to help match a location in the file.

${diffBlocksThatDidntMatch
  .map(
    (block, i) => `Change ${i + 1}:
${createSearchReplaceBlock(block.searchContent, block.replaceContent)}`
  )
  .join('\n')}

Please rewrite the file content to include these intended changes while preserving the rest of the file. Only make the minimal changes necessary to incorporate the intended edits. Do not edit any other code. Please preserve all other comments, etc.

Return only the full, complete file content with no additional text or explanation. Do not use \`\`\` markdown code blocks to enclose the file content, instead, start with the first line of the file. Do not excerpt portions of the file, write out the entire updated file.
`.trim()

  const startTime = Date.now()
  // const response = await promptOpenAI([{ role: 'user', content: prompt }], {
  //   clientSessionId,
  //   fingerprintId,
  //   userInputId,
  //   userId,
  //   model: openaiModels.gpt4omini,
  //   predictedContent: updatedContent,
  // })
  const response = await promptRelaceAI([{ role: 'user', content: prompt }], {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: 'Fast-Apply',
  })
  const endTime = Date.now()
  logger.debug(
    { response, diffBlocksThatDidntMatch, duration: endTime - startTime },
    `applyRemainingChanges for ${diffBlocksThatDidntMatch.length} blocks`
  )

  // Only remove backticks if they wrap the entire response
  const cleanResponse = response.match(/^```[^\n]*\n([\s\S]*)\n```$/)
    ? response.replace(/^```[^\n]*\n/, '').replace(/\n```$/, '')
    : response

  // Add newline to maintain consistency with original file endings
  return cleanResponse + '\n'
}
