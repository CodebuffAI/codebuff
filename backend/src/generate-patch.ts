import { createPatch } from 'diff'

import { Message } from 'common/actions'
import { expandNewContent } from './generate-diffs-via-expansion'
import { generateExpandedFileWithDiffBlocks } from './generate-diffs-prompt'
import { expandNewContentUsingLineNumbers } from './expand-with-line-numbers'

const LARGE_FILE_CHARACTERS = 10000

export async function generatePatch(
  userId: string,
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[],
  fullResponse: string
) {
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  let updatedFile = await expandNewContentUsingLineNumbers(
    userId,
    normalizedOldContent,
    normalizedNewContent,
    filePath,
    messageHistory,
    fullResponse
  )
  updatedFile = updatedFile.replaceAll('\n', lineEnding)
  return createPatch(filePath, oldContent, updatedFile)
}
