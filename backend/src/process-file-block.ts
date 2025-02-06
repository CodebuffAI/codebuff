import { WebSocket } from 'ws'
import { createPatch } from 'diff'
import { FileChange } from 'common/actions'
import { logger } from './util/logger'
import { requestFile } from './websockets/websocket-action'
import { promptRelaceAI } from './relace-api'
import { cleanMarkdownCodeBlock } from 'common/util/file'
import { hasLazyEdit } from 'common/util/string'
import { countTokens } from './util/token-counter'
import { promptClaude } from './claude'
import { claudeModels } from 'common/constants'
import { parseAndGetDiffBlocksSingleFile } from './generate-diffs-prompt'

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
      userId
    )
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
