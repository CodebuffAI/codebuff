import {
  createMarkdownFileBlock,
  createSearchReplaceBlock,
} from 'common/util/file'
import { CostMode, models } from 'common/constants'
import { logger } from './util/logger'
import { promptOpenAI } from './openai-api'

export const parseAndGetDiffBlocksSingleFile = (
  newContent: string,
  oldFileContent: string
) => {
  const diffBlocksThatDidntMatch: {
    searchContent: string
    replaceContent: string
  }[] = []
  const diffBlocks: { searchContent: string; replaceContent: string }[] = []
  const blockRegex =
    /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
  let blockMatch

  while ((blockMatch = blockRegex.exec(newContent)) !== null) {
    const change = {
      searchContent: blockMatch[1],
      replaceContent: blockMatch[2],
    }

    if (oldFileContent.includes(change.searchContent)) {
      diffBlocks.push(change)
    } else {
      const newChange = tryToDoStringReplacementWithExtraIndentation(
        oldFileContent,
        change.searchContent,
        change.replaceContent
      )
      if (newChange) {
        logger.debug('Matched with indentation modification')
        diffBlocks.push(newChange)
      } else {
        // Try matching without any whitespace as a last resort
        const noWhitespaceSearch = change.searchContent.replace(/\s+/g, '')
        const noWhitespaceOld = oldFileContent.replace(/\s+/g, '')
        const noWhitespaceIndex = noWhitespaceOld.indexOf(noWhitespaceSearch)

        if (noWhitespaceIndex >= 0) {
          // Count non-whitespace characters to find the real position
          let realIndex = 0
          let nonWhitespaceCount = 0
          while (nonWhitespaceCount < noWhitespaceIndex) {
            if (oldFileContent[realIndex].match(/\S/)) {
              nonWhitespaceCount++
            }
            realIndex++
          }

          // Count non-whitespace characters in search content to find length
          let searchLength = 0
          let nonWhitespaceSearchCount = 0
          while (
            nonWhitespaceSearchCount < noWhitespaceSearch.length &&
            realIndex + searchLength < oldFileContent.length
          ) {
            if (oldFileContent[realIndex + searchLength].match(/\S/)) {
              nonWhitespaceSearchCount++
            }
            searchLength++
          }

          // Find the actual content with original whitespace
          const actualContent = oldFileContent.slice(
            realIndex,
            realIndex + searchLength
          )
          if (oldFileContent.includes(actualContent)) {
            logger.debug('Matched with whitespace removed')
            diffBlocks.push({
              searchContent: actualContent,
              replaceContent: change.replaceContent,
            })
          }
        } else {
          diffBlocksThatDidntMatch.push(change)
        }
      }
    }
  }
  return {
    diffBlocks,
    diffBlocksThatDidntMatch,
  }
}

const tryToDoStringReplacementWithExtraIndentation = (
  oldFileContent: string,
  searchContent: string,
  replaceContent: string
) => {
  for (let i = 1; i <= 12; i++) {
    const searchContentWithIndentation = searchContent
      .split('\n')
      .map((line) => (line ? ' '.repeat(i) + line : line))
      .join('\n')
    if (oldFileContent.includes(searchContentWithIndentation)) {
      return {
        searchContent: searchContentWithIndentation,
        replaceContent: replaceContent
          .split('\n')
          .map((line) => (line ? ' '.repeat(i) + line : line))
          .join('\n'),
      }
    }
  }
  for (let i = 1; i <= 6; i++) {
    const searchContentWithIndentation = searchContent
      .split('\n')
      .map((line) => (line ? '\t'.repeat(i) + line : line))
      .join('\n')
    if (oldFileContent.includes(searchContentWithIndentation)) {
      return {
        searchContent: searchContentWithIndentation,
        replaceContent: replaceContent
          .split('\n')
          .map((line) => (line ? '\t'.repeat(i) + line : line))
          .join('\n'),
      }
    }
  }
  return null
}

export async function retryDiffBlocksPrompt(
  filePath: string,
  oldContent: string,
  costMode: CostMode,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  diffBlocksThatDidntMatch: { searchContent: string; replaceContent: string }[]
) {
  const newPrompt =
    `The assistant failed to find a match for the following changes. Please help the assistant understand what the changes should be.

Here is the old file content:
${createMarkdownFileBlock(filePath, oldContent)}

The assistant generated the following SEARCH/REPLACE blocks where the search content did not match the old file contents:

${diffBlocksThatDidntMatch.map((change) => createSearchReplaceBlock(change.searchContent, change.replaceContent)).join('\n\n')}

The search content needs to match an exact substring of the old file content, which will be replaced by the replace content. Use the minimal possible search content that matches the intended location in the old file content. Be extra careful when matching whitespace, single quotes, double quotes, and backticks.

Provide a new set of SEARCH/REPLACE changes to make the intended edit from the old file.`.trim()

  const response = await promptOpenAI([{ role: 'user', content: newPrompt }], {
    model: models.o3mini,
    clientSessionId,
    fingerprintId,
    userInputId,
    userId,
  })
  const {
    diffBlocks: newDiffBlocks,
    diffBlocksThatDidntMatch: newDiffBlocksThatDidntMatch,
  } = parseAndGetDiffBlocksSingleFile(response, oldContent)

  if (newDiffBlocksThatDidntMatch.length > 0) {
    logger.error(
      {
        response,
        diffBlocksThatDidntMatch,
        newDiffBlocks,
        newDiffBlocksThatDidntMatch,
        filePath,
      },
      `retryDiffBlocksPrompt failed ${filePath}`
    )
  } else {
    logger.debug(
      {
        response,
        diffBlocksThatDidntMatch,
        newDiffBlocks,
        newDiffBlocksThatDidntMatch,
        filePath,
      },
      `retryDiffBlocksPrompt result ${filePath}`
    )
  }

  return { newDiffBlocks, newDiffBlocksThatDidntMatch }
}
