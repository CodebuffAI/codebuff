import {
  createMarkdownFileBlock,
  createSearchReplaceBlock,
  parseFileBlocks,
} from 'common/util/file'
import { CostMode, models, STOP_MARKER } from 'common/constants'
import { promptClaude } from './claude'
import { logger } from './util/logger'
import { promptDeepseek } from './deepseek-api'

export const parseAndGetDiffBlocks = (
  response: string,
  filePath: string,
  oldFileContent: string
) => {
  const diffBlocksThatDidntMatch: {
    searchContent: string
    replaceContent: string
  }[] = []
  const diffBlocks: { searchContent: string; replaceContent: string }[] = []
  const files = parseFileBlocks(response)
  for (const fileContent of Object.values(files)) {
    const blockRegex =
      /<<<<<<< SEARCH\n([\s\S]*?)\n=======\n([\s\S]*?)\n>>>>>>> REPLACE/g
    let blockMatch

    while ((blockMatch = blockRegex.exec(fileContent)) !== null) {
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
          console.log('Matched with indentation modification')
          diffBlocks.push(newChange)
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

export const retryDiffBlocksPrompt = async (
  filePath: string,
  oldContent: string,
  costMode: CostMode,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userId: string | undefined,
  diffBlocksThatDidntMatch: { searchContent: string; replaceContent: string }[]
) => {
  const newPrompt =
    `The assistant failed to find a match for the following changes. Please help the assistant understand what the changes should be.

Here is the old file content:
${createMarkdownFileBlock(filePath, oldContent)}

The assistant generated the following SEARCH/REPLACE blocks where the search content did not match the old file contents:

${diffBlocksThatDidntMatch.map((change) => createSearchReplaceBlock(change.searchContent, change.replaceContent)).join('\n\n')}

You should:
1. Use <thinking> blocks to explain what might have gone wrong in these SEARCH/REPLACE blocks that didn't match. The search content needs to match an exact substring of the old file content.
2. Provide a new set of SEARCH/REPLACE changes to make the intended edit from the old file.`.trim()

  let response: string
  if (costMode === 'lite') {
    response = await promptDeepseek([{ role: 'user', content: newPrompt }], {
      clientSessionId,
      fingerprintId,
      userInputId,
      model: models.deepseekChat,
      userId,
    })
  } else {
    response = await promptClaude([{ role: 'user', content: newPrompt }], {
      clientSessionId,
      fingerprintId,
      userInputId,
      model: models.sonnet,
      userId,
    })
  }
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
