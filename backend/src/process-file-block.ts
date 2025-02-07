import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { FileChange, Message } from 'common/actions'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import { createRelaceMessageId, promptRelaceAI } from './relace-api'
import { cleanMarkdownCodeBlock, parseFileBlocks } from 'common/util/file'
import { hasLazyEdit } from 'common/util/string'
import { countTokens } from './util/token-counter'
import { promptClaude } from './claude'
import { claudeModels, geminiModels } from 'common/constants'
import { parseAndGetDiffBlocksSingleFile } from './generate-diffs-prompt'
import { GeminiMessage, promptGemini } from './gemini-api'

export async function processFileBlock(
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  ws: WebSocket,
  filePath: string,
  newContent: string,
  messages: Message[],
  fullResponse: string,
  userId: string | undefined,
  userMessage: string | undefined
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

  let updatedContent: string
  const tokenCount = countTokens(normalizedInitialContent)

  if (tokenCount > LARGE_FILE_TOKEN_LIMIT) {
    const largeFileContent = await handleLargeFile(
      normalizedInitialContent,
      normalizedEditSnippet,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId
    )

    if (!largeFileContent) {
      return null
    }

    updatedContent = largeFileContent
  } else {
    updatedContent = await fastRewrite(
      normalizedInitialContent,
      normalizedEditSnippet,
      filePath,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      userMessage
    )
    const shouldAddPlaceholders = await shouldAddFilePlaceholders(
      clientSessionId,
      fingerprintId,
      userInputId,
      filePath,
      normalizedInitialContent,
      updatedContent,
      messages,
      fullResponse,
      userId
    )

    if (shouldAddPlaceholders) {
      const placeholderComment = `... existing code ...`
      const updatedEditSnippet = `${placeholderComment}\n${updatedContent}\n${placeholderComment}`
      updatedContent = await fastRewrite(
        normalizedInitialContent,
        updatedEditSnippet,
        filePath,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        userMessage
      )
    }
  }

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

/**
 * This whole function is about checking for a specific case where claude
 * sketches an update to a single function, but forgets to add ... existing code ...
 * above and below the function.
 */
const shouldAddFilePlaceholders = async (
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  filePath: string,
  oldContent: string,
  rewrittenNewContent: string,
  messageHistory: Message[],
  fullResponse: string,
  userId: string | undefined
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

  const messages = [
    ...messageHistory,
    {
      role: 'assistant' as const,
      content: fullResponse,
    },
    {
      role: 'user' as const,
      content: prompt,
    },
  ]
  const response = await promptGemini(messages as GeminiMessage[], {
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
    'shouldAddFilePlaceholders response'
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

  const messageId = createRelaceMessageId()
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
  return response + '\n'
}

const LARGE_FILE_TOKEN_LIMIT = 12000

async function handleLargeFile(
  oldContent: string,
  editSnippet: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined
): Promise<string | null> {
  const prompt = `You are an expert programmer tasked with creating SEARCH/REPLACE blocks to implement a change in a large file. The change should match the intent of the edit snippet while using exact content from the old file.

Old file content:
\`\`\`
${oldContent}
\`\`\`

Edit snippet (the new content to implement):
\`\`\`
${editSnippet}
\`\`\`

Please analyze the edit snippet and create SEARCH/REPLACE blocks that will transform the old content into the intended new content. The SEARCH content must be an exact substring match from the old file.

Important:
1. The SEARCH content must match exactly - no whitespace differences allowed
2. Keep the changes minimal and focused
3. Preserve the original formatting and indentation
4. Only implement the changes shown in the edit snippet

Format your response with SEARCH/REPLACE blocks like this:
<<<<<<< SEARCH
[exact content from old file]
=======
[new content that matches edit snippet intent]
>>>>>>> REPLACE`

  const response = await promptClaude([{ role: 'user', content: prompt }], {
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    model: claudeModels.sonnet,
  })

  const { diffBlocks, diffBlocksThatDidntMatch } =
    parseAndGetDiffBlocksSingleFile(response, oldContent)

  if (diffBlocksThatDidntMatch.length > 0) {
    logger.error(
      { diffBlocksThatDidntMatch },
      'Failed to create matching diff blocks for large file'
    )
    return null
  }

  // Apply the diff blocks in sequence
  let updatedContent = oldContent
  for (const { searchContent, replaceContent } of diffBlocks) {
    updatedContent = updatedContent.replace(searchContent, replaceContent)
  }

  return updatedContent
}
