import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { FileChange } from 'common/actions'
import { Message } from 'common/types/message'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import { cleanMarkdownCodeBlock, parseFileBlocks } from 'common/util/file'
import { generateCompactId, hasLazyEdit } from 'common/util/string'
import { countTokens } from './util/token-counter'
import { geminiModels, CostMode, models } from 'common/constants'
import {
  parseAndGetDiffBlocksSingleFile,
  retryDiffBlocksPrompt,
} from './generate-diffs-prompt'
import { promptOpenAI } from './llm-apis/openai-api'
import { promptGeminiWithFallbacks } from './llm-apis/gemini-with-fallbacks'
import { promptRelaceAI } from './llm-apis/relace-api'
import { buildArray } from 'common/util/array'

export async function processFileBlock(
  path: string,
  newContent: string,
  messages: Message[],
  fullResponse: string,
  lastUserPrompt: string | undefined,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  ws: WebSocket,
  costMode: CostMode
): Promise<FileChange | null> {
  if (newContent.trim() === '[UPDATED_BY_ANOTHER_ASSISTANT]') {
    return null
  }

  const initialContent = await requestFile(ws, path)

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
      type: 'file',
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
  patch = patch.replaceAll('\n', lineEnding)

  logger.debug(
    {
      path,
      editSnippet: newContent,
      patch,
    },
    `processFileBlock: Generated patch for ${path}`
  )
  return {
    type: 'patch',
    path,
    content: patch,
  }
}

/**
 * This whole function is about checking for a specific case where claude
 * sketches an update to a single function, but forgets to add ... existing code ...
 * above and below the function.
 */
const shouldAddFilePlaceholders = async (
  filePath: string,
  oldContent: string,
  rewrittenNewContent: string,
  messageHistory: Message[],
  fullResponse: string,
  userId: string | undefined,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string
) => {
  const fileBlocks = parseFileBlocks(
    messageHistory
      .map((message) =>
        typeof message.content === 'string'
          ? message.content
          : message.content.map((c) => ('text' in c ? c.text : '')).join('\n')
      )
      .join('\n') + fullResponse
  )
  const fileWasPreviouslyEdited = Object.keys(fileBlocks).includes(filePath)
  if (!fileWasPreviouslyEdited) {
    // If Claude hasn't edited this file before, it's almost certainly not a local-only change.
    // Usually, it's only when Claude is editing a function for a second or third time that
    // it forgets to add ${EXISTING_CODE_MARKER}s above and below the function.
    return false
  }

  const prompt = `
Here's the original file:

\`\`\`
${oldContent}
\`\`\`

And here's the proposed new content for the file:

\`\`\`
${rewrittenNewContent}
\`\`\`

Consider the above information and conversation and answer the following question.
Most likely, the assistant intended to replace the entire original file with the new content. If so, write "REPLACE_ENTIRE_FILE".
In other cases, the assistant forgot to include the rest of the file and just wrote in one section of the file to be edited. Typically this happens if the new content focuses on the change of a single function or section of code with the intention to edit just this section, but keep the rest of the file unchanged. For example, if the new content is just a single function whereas the original file has multiple functions, and the conversation does not imply that the other functions should be deleted.
If you believe this is the scenario, please write "LOCAL_CHANGE_ONLY". Otherwise, write "REPLACE_ENTIRE_FILE".
Do not write anything else.
`.trim()

  const startTime = Date.now()

  const messages = buildArray(
    ...messageHistory,
    fullResponse && {
      role: 'assistant' as const,
      content: fullResponse,
    },
    {
      role: 'user' as const,
      content: prompt,
    }
  )
  const response = await promptGeminiWithFallbacks(messages, undefined, {
    clientSessionId,
    fingerprintId,
    userInputId,
    model: geminiModels.gemini2flash,
    userId,
  })
  const shouldAddPlaceholderComments = response.includes('LOCAL_CHANGE_ONLY')
  logger.debug(
    {
      response,
      shouldAddPlaceholderComments,
      oldContent,
      rewrittenNewContent,
      filePath,
      duration: Date.now() - startTime,
    },
    `shouldAddFilePlaceholders response for ${filePath}`
  )

  return shouldAddPlaceholderComments
}

export async function fastRewrite(
  initialContent: string,
  editSnippet: string,
  filePath: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  userMessage: string | undefined
) {
  const startTime = Date.now()

  const messageId = generateCompactId('cb-')
  const response = await promptRelaceAI(initialContent, editSnippet, {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    userMessage,
    messageId,
  })

  logger.debug(
    {
      initialContent,
      editSnippet,
      response,
      userMessage,
      messageId,
      duration: Date.now() - startTime,
    },
    `fastRewrite of ${filePath}`
  )

  // Add newline to maintain consistency with original file endings
  return response
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

  const prompt = `You are an expert programmer tasked with creating SEARCH/REPLACE blocks to implement a change in a large file. The change should match the intent of the edit snippet while using exact content from the old file.

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
2. Keep the changes minimal and focused
3. Preserve the original formatting, indentation, and comments
4. Only implement the changes shown in the edit snippet

Please output just the SEARCH/REPLACE blocks like this:
<<<<<<< SEARCH
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
      filePath,
      duration: Date.now() - startTime,
    },
    'handleLargeFile'
  )
  return updatedContent
}
