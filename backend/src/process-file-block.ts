import { CostMode, models } from 'common/constants'
import { cleanMarkdownCodeBlock } from 'common/util/file'
import { hasLazyEdit } from 'common/util/string'
import { createPatch } from 'diff'

import { CoreMessage } from 'ai'
import { fastRewrite, shouldAddFilePlaceholders } from './fast-rewrite'
import {
  parseAndGetDiffBlocksSingleFile,
  retryDiffBlocksPrompt,
} from './generate-diffs-prompt'
import { promptAiSdk } from './llm-apis/vercel-ai-sdk/ai-sdk'
import { logger } from './util/logger'
import { countTokens } from './util/token-counter'

export async function processFileBlock(
  path: string,
  latestContentPromise: Promise<string | null>,
  newContent: string,
  messages: CoreMessage[],
  fullResponse: string,
  userPrompt: string | null,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  costMode: CostMode,
  orgId?: string | null, // Add orgId
  repoUrl?: string | null // Add repoUrl
): Promise<
  | {
      tool: 'write_file'
      path: string
      content: string // Updated copy of the file
      patch: string | undefined // Patch diff string. Undefined for a new file
    }
  | {
      tool: 'write_file'
      path: string
      error: string // Error message if the file could not be updated
    }
> {
  const fileContent = await latestContentPromise

  if (fileContent === null) {
    let cleanContent = cleanMarkdownCodeBlock(newContent)

    if (hasLazyEdit(cleanContent) && !path.endsWith('.md')) {
      logger.debug(
        { path, newContent },
        `processFileBlock: New file contained a lazy edit for ${path}. Aborting.`
      )
      return {
        tool: 'write_file' as const,
        path,
        error:
          'You created a new file with a placeholder comment like `// ... existing code ...` (or equivalent for other languages). Are you sure you have the file path right? You probably meant to modify an existing file instead of providing a path to a new file.',
      }
    }

    logger.debug(
      { path, cleanContent },
      `processFileBlock: Created new file ${path}`
    )
    return {
      tool: 'write_file' as const,
      path,
      content: cleanContent,
      patch: undefined,
    }
  }

  if (newContent === fileContent) {
    logger.info(
      { newContent },
      `processFileBlock: New was same as old, skipping ${path}`
    )
    return {
      tool: 'write_file' as const,
      path,
      error: 'The new content was the same as the old content, skipping.',
    }
  }

  const lineEnding = fileContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const normalizedFileContent = normalizeLineEndings(fileContent)
  const normalizedEditSnippet = normalizeLineEndings(newContent)

  let updatedContent: string
  const tokenCount =
    countTokens(normalizedFileContent) + countTokens(normalizedEditSnippet)

  if (tokenCount > LARGE_FILE_TOKEN_LIMIT) {
    const largeFileContent = await handleLargeFile(
      normalizedFileContent,
      normalizedEditSnippet,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      path,
      costMode,
      orgId,
      repoUrl
    )

    if (!largeFileContent) {
      return {
        tool: 'write_file' as const,
        path,
        error:
          'Failed to apply the write file change to this large file. You should try using the str_replace tool instead for large files.',
      }
    }

    updatedContent = largeFileContent
  } else {
    updatedContent = await fastRewrite(
      normalizedFileContent,
      normalizedEditSnippet,
      path,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      userPrompt ?? undefined, // Convert null to undefined
      orgId,
      repoUrl
    )
    const shouldAddPlaceholders = await shouldAddFilePlaceholders(
      path,
      normalizedFileContent,
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
        normalizedFileContent,
        updatedEditSnippet,
        path,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
        userPrompt ?? undefined, // Convert null to undefined
        orgId,
        repoUrl
      )
    }
  }

  let patch = createPatch(path, normalizedFileContent, updatedContent)
  const lines = patch.split('\n')
  const hunkStartIndex = lines.findIndex((line) => line.startsWith('@@'))
  if (hunkStartIndex !== -1) {
    patch = lines.slice(hunkStartIndex).join('\n')
  } else {
    logger.debug(
      {
        path,
        initialContent: fileContent,
        changes: newContent,
        patch,
      },
      `processFileBlock: No change to ${path}`
    )
    return {
      tool: 'write_file' as const,
      path,
      error: 'The new content was the same as the old content, skipping.',
    }
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

const LARGE_FILE_TOKEN_LIMIT = 64_000

export async function handleLargeFile(
  oldContent: string,
  editSnippet: string,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  filePath: string,
  costMode: CostMode,
  orgId?: string | null, // Add orgId
  repoUrl?: string | null // Add repoUrl
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

  const response = await promptAiSdk({
    messages: [{ role: 'user', content: prompt }],
    model: models.o4mini,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
    maxTokens: 4000,
    temperature: 0,
    orgId: orgId ?? null, // Pass orgId
    repoUrl: repoUrl ?? null, // Pass repoUrl
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
