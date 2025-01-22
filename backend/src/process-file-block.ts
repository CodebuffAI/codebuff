import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { Message, FileChange } from 'common/actions'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import {
  parseAndGetDiffBlocksSingleFile,
  retryDiffBlocksPrompt,
} from './generate-diffs-prompt'
import { CostMode, openaiModels } from 'common/constants'
import { promptOpenAI } from './openai-api'
import { promptRelaceAI } from './relace-api'
import {
  createSearchReplaceBlock,
  cleanMarkdownCodeBlock,
} from 'common/util/file'
import { hasLazyEdit, safeReplace } from 'common/util/string'

export async function processFileBlock(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  ws: WebSocket,
  messageHistory: Message[],
  fullResponse: string,
  filePath: string,
  newContent: string,
  costMode: CostMode,
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
    let cleanContent = cleanMarkdownCodeBlock(newContent)

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
  for (const diffBlock of diffBlocks) {
    const { searchContent, replaceContent } = diffBlock
    updatedContent = safeReplace(updatedContent, searchContent, replaceContent)
  }

  const outputHasLazyEdit =
    hasLazyEdit(updatedContent) && !hasLazyEdit(normalizedOldContent)

  const outputHasReplaceBlocks =
    updatedContent.includes('<<<<<<< SEARCH') ||
    updatedContent.includes('>>>>>>> REPLACE')

  if (outputHasLazyEdit) {
    logger.debug(
      {
        filePath,
        newContent,
        oldContent,
        diffBlocks,
      },
      `processFileBlock: ERROR 6623380: Output has rest of blocks for ${filePath}`
    )
    updatedContent = await applyRemainingChanges(
      oldContent,
      normalizedNewContent,
      filePath,
      fullResponse,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
      true
    )
  } else if (outputHasReplaceBlocks) {
    logger.debug(
      {
        filePath,
        newContent,
        oldContent,
        diffBlocks,
        diffBlocksThatDidntMatch,
      },
      `processFileBlock: ERROR 4236481: Included SEARCH/REPLACE blocks for ${filePath}`
    )
    updatedContent = await applyRemainingChanges(
      updatedContent,
      normalizedNewContent,
      filePath,
      fullResponse,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
      false
    )
  } else if (updatedDiffBlocksThatDidntMatch.length > 0) {
    const changes = updatedDiffBlocksThatDidntMatch
      .map((block) =>
        createSearchReplaceBlock(block.searchContent, block.replaceContent)
      )
      .join('\n')
    updatedContent = await applyRemainingChanges(
      updatedContent,
      changes,
      filePath,
      fullResponse,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
      false
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
  changes: string,
  filePath: string,
  fullResponse: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode,
  hasLazyEdit: boolean
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

${hasLazyEdit ? 'Please ignore any comments with "..." and preserve the original content of the file.' : 'The following changes were intended for this file but could not be applied using exact string matching. Note that each change is represented as a SEARCH string found in the current file that is intended to be replaced with the REPLACE string. Often the SEARCH string will contain extra lines of context to help match a location in the file.'}

${changes}

Please rewrite the file content to include these intended changes while preserving the rest of the file. Only make the minimal changes necessary to incorporate the intended edits. Do not edit any other code. Please preserve all other comments, etc.

Return only the full, complete file content with no additional text or explanation. Do not edit any other code. Please preserve all other comments, etc.
`.trim()

  const startTime = Date.now()
  // const response = await promptOpenAI(
  //   [
  //     { role: 'user', content: prompt },
  //     { role: 'assistant', content: '```' },
  //   ],
  //   {
  //     clientSessionId,
  //     fingerprintId,
  //     userInputId,
  //     userId,
  //     model: costMode === 'max' ? openaiModels.gpt4o : openaiModels.gpt4omini,
  //     predictedContent: updatedContent,
  //   }
  // )
  const response = await promptRelaceAI([{ role: 'user', content: prompt }], {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: 'Fast-Apply',
  })
  const endTime = Date.now()
  logger.debug(
    { response, changes, duration: endTime - startTime },
    `applyRemainingChanges for ${filePath}`
  )

  const cleanResponse = cleanMarkdownCodeBlock(response)

  // Add newline to maintain consistency with original file endings
  return cleanResponse + '\n'
}
