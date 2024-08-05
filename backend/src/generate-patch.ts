import { createPatch } from 'diff'

import { Message } from 'common/actions'
import { expandNewContent } from './generate-diffs-via-expansion'
import { generateExpandedFileWithDiffBlocks } from './generate-diffs-prompt'

const LARGE_FILE_CHARACTERS = 10000

export async function generatePatch(
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[]
) {
  const normalizeLineEndings = (str: string) => str.replace(/\r\n/g, '\n')
  const lineEnding = oldContent.includes('\r\n') ? '\r\n' : '\n'
  const normalizedOldContent = normalizeLineEndings(oldContent)
  const normalizedNewContent = normalizeLineEndings(newContent)

  let updatedFile: string
  if (
    oldContent.length > LARGE_FILE_CHARACTERS &&
    newContent.length < LARGE_FILE_CHARACTERS / 3
  ) {
    updatedFile = await generateExpandedFileWithDiffBlocks(
      messageHistory,
      filePath,
      normalizedOldContent,
      normalizedNewContent
    )
  } else {
    updatedFile = await expandNewContent(
      normalizedOldContent,
      normalizedNewContent,
      filePath,
      messageHistory
    )
  }
  updatedFile = updatedFile.replaceAll('\n', lineEnding)
  return createPatch(filePath, oldContent, updatedFile)
}
