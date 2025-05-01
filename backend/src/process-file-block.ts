import { CostMode, models } from 'common/constants'
import { Message } from 'common/types/message'
import { cleanMarkdownCodeBlock } from 'common/util/file'
import { generateCompactId, hasLazyEdit } from 'common/util/string'
import { createPatch } from 'diff'

import { fastRewrite, shouldAddFilePlaceholders } from './fast-rewrite'
import {
  parseAndGetDiffBlocksSingleFile,
  retryDiffBlocksPrompt,
} from './generate-diffs-prompt'
import { promptOpenAI } from './llm-apis/openai-api'
import { sendToRelaceLongContext } from './llm-apis/relace-api'
import { logger } from './util/logger'
import { countTokens } from './util/token-counter'

export async function processFileBlock(
  path: string,
  initialContentPromise: Promise<string | null>,
  newContent: string,
  messages: Message[],
  fullResponse: string,
  lastUserPrompt: string | undefined,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode
): Promise<{
  tool: 'write_file'
  path: string
  content: string
  patch?: string
} | null> {
  const initialContent = await initialContentPromise

  if (initialContent === null) {
    let cleanContent = cleanMarkdownCodeBlock(newContent)

    if (hasLazyEdit(cleanContent) && !path.endsWith('.md')) {
      logger.debug(
        { path, newContent },
        `processFileBlock: New file contained a lazy edit for ${path}. Aborting.`
      )
      return null
    }

    logger.debug(
      { path, cleanContent },
      `processFileBlock: Created new file ${path}`
    )
    return {
      tool: 'write_file' as const,
      path,
      content: cleanContent,
    }
  }

  if (newContent === initialContent) {
    logger.info(
      { newContent },
      `processFileBlock: New was same as old, skipping ${path}`
    )
    return null
  }

  const lineEnding = initialContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedInitialContent = normalizeLineEndings(initialContent)
  const normalizedEditSnippet = normalizeLineEndings(newContent)

  let updatedContent: string
  const tokenCount =
    countTokens(normalizedInitialContent) + countTokens(normalizedEditSnippet)

  if (tokenCount > LARGE_FILE_TOKEN_LIMIT) {
    // Delete this later vvv
    if (tokenCount < 64_000) {
      // Temporary: send to relace
      const messageId = generateCompactId('cb-')
      // no need to await, just send the request and continue
      sendToRelaceLongContext(normalizedInitialContent, normalizedEditSnippet, {
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        messageId,
        userMessage: lastUserPrompt,
      })
    }
    // Delete this later ^^^

    const largeFileContent = await handleLargeFile(
      normalizedInitialContent,
      normalizedEditSnippet,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      path,
      costMode
    )

    if (!largeFileContent) {
      return null
    }

    updatedContent = largeFileContent
  } else {
    updatedContent = await fastRewrite(
      normalizedInitialContent,
      normalizedEditSnippet,
      path,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      lastUserPrompt
    )
    const shouldAddPlaceholders = await shouldAddFilePlaceholders(
      path,
      normalizedInitialContent,
      updatedContent,
      messages,
      fullResponse,
      userId,
      clientSessionId,
      fingerprintId,
      userInputId
    )

    if (shouldAddPlaceholders) {
      const placeholderComment = `... existing code ...`
      const updatedEditSnippet = `${placeholderComment}\n${updatedContent}\n${placeholderComment}`
      updatedContent = await fastRewrite(
        normalizedInitialContent,
        updatedEditSnippet,
        path,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        lastUserPrompt
      )
    }
  }

  let patch = createPatch(path, normalizedInitialContent, updatedContent)
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
      `processFileBlock: No change to ${path}`
    )
    return null
  }
  logger.debug(
    {
      path,
      editSnippet: newContent,
      updatedContent,
      patch,
    },
    `processFileBlock: Updated file ${path}`
  )

  const patchOriginalLineEndings = patch.replaceAll('\n', lineEnding)
  const updatedContentOriginalLineEndings = updatedContent.replaceAll(
    '\n',
    lineEnding
  )

  return {
    tool: 'write_file' as const,
    path,
    content: updatedContentOriginalLineEndings,
    patch: patchOriginalLineEndings,
  }
}

const LARGE_FILE_TOKEN_LIMIT = 16_000

export async function handleLargeFile(
  oldContent: string,
  editSnippet: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  filePath: string,
  costMode: CostMode
): Promise<string | null> {
  const startTime = Date.now()

  // If the whole file is rewritten, we can just return the new content.
  if (!hasLazyEdit(editSnippet)) {
    return editSnippet
  }

  const prompt =
    `You are an expert programmer tasked with creating SEARCH/REPLACE blocks to implement a change in a large file. The change should match the intent of the edit snippet while using exact content from the old file.

Old file content:
\`\`\`
${oldContent}
\`\`\`

Edit snippet (the new content to implement):
\`\`\`
${editSnippet}
\`\`\`

Please analyze the edit snippet and create SEARCH/REPLACE blocks that will transform the old content into the intended new content. The SEARCH content must be an exact substring match from the old file — try to keep the search content as short as possible.

Important:
1. The SEARCH content must match exactly to a substring of the old file content - make sure you're using the exact same whitespace, single quotes, double quotes, and backticks.
2. Keep the changes minimal and focused. Do not include any "placeholder comments" (including but not limited to \`// ... existing code ...\`) unless you think it should be included in the final output.
3. Preserve the original formatting, indentation, and comments
4. Only implement the changes shown in the edit snippet

Please output just the SEARCH/REPLACE blocks like this:

` +
    `<<<<<<< SEARCH
[exact content from old file]
=======
[new content that matches edit snippet intent]
>>>>>>> REPLACE`

  const response = await promptOpenAI([{ role: 'user', content: prompt }], {
    model: models.o3mini,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })

  const { diffBlocks, diffBlocksThatDidntMatch } =
    parseAndGetDiffBlocksSingleFile(response, oldContent)

  let updatedContent = oldContent
  for (const { searchContent, replaceContent } of diffBlocks) {
    updatedContent = updatedContent.replace(searchContent, replaceContent)
  }

  if (diffBlocksThatDidntMatch.length > 0) {
    logger.debug(
      {
        duration: Date.now() - startTime,
        editSnippet,
        response,
        diffBlocks,
        diffBlocksThatDidntMatch,
        filePath,
        oldContent,
      },
      'Initial diff blocks failed to match, retrying...'
    )

    const { newDiffBlocks, newDiffBlocksThatDidntMatch } =
      await retryDiffBlocksPrompt(
        filePath,
        updatedContent,
        costMode,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        diffBlocksThatDidntMatch
      )

    if (newDiffBlocksThatDidntMatch.length > 0) {
      logger.error(
        {
          diffBlocks: newDiffBlocks,
          diffBlocksThatDidntMatch: newDiffBlocksThatDidntMatch,
          originalDiffBlocksThatDidntMatch: diffBlocksThatDidntMatch,
          originalDiffBlocks: diffBlocks,
          filePath,
          oldContent,
          editSnippet,
          duration: Date.now() - startTime,
        },
        'Failed to create matching diff blocks for large file after retry'
      )
      return null
    }

    for (const { searchContent, replaceContent } of newDiffBlocks) {
      updatedContent = updatedContent.replace(searchContent, replaceContent)
    }
  }

  logger.debug(
    {
      updatedContent,
      oldContent,
      editSnippet,
      diffBlocks,
      filePath,
      duration: Date.now() - startTime,
    },
    `handleLargeFile ${filePath}`
  )
  return updatedContent
}
