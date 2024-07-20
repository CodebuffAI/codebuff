import { promptClaude } from './claude'
import { models } from './claude'
import { debugLog } from './debug'
import { Message } from 'common/actions'

export async function expandNewContent(
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[]
): Promise<string> {
  const prompt = `You are an expert programmer tasked with expanding a shortened version of a file into its full content. The shortened version uses comments like "// ... existing code ..." to indicate unchanged sections. Your task is to replace these comments with the actual code from the old version of the file.

Here is the message history for context:
${messageHistory.map((m) => `${m.role}: ${m.content}`).join('\n\n')}

Old file content:
<file path="${filePath}">
${oldContent}
</file>

New file content (with placeholders):
<file path="${filePath}">
${newContent}
</file>

1. Please discuss the changes in the new file content compared to the old file content in <discussion> blocks.
2. Then, please provide the full expanded content of the new file, replacing all "// ... existing code ..." comments with the appropriate code from the old file. Maintain the exact indentation and formatting of both the old and new content. Do not add any extra comments or explanations.

Output the full content of the new file within a <file> block, using the provided file path as an attribute. For example:

<file path="${filePath}">
// Full expanded file content here
</file>
`

  debugLog('Expand new content prompt:', prompt)

  const expandedContentResponse = await promptClaude(prompt, { model: models.haiku })
  
  debugLog('Expanded content response:', expandedContentResponse)

  // Extract the content from the <file> block
  const fileContentMatch = expandedContentResponse.match(/<file[^>]*>([\s\S]*)<\/file>/)
  if (fileContentMatch) {
    return fileContentMatch[1].trim()
  } else {
    throw new Error('Failed to extract file content from Claude Haiku response')
  }
}

export async function generateDiffBlocks(
  oldContent: string,
  newContent: string
): Promise<{ searchContent: string; replaceContent: string }[]> {
  const oldLines = oldContent.split('\n')
  const newLines = newContent.split('\n')
  const diffBlocks: { searchContent: string; replaceContent: string }[] = []
  let i = 0, j = 0

  function findNextMatch(startOld: number, startNew: number, windowSize: number = 10): [number, number] {
    for (let k = 0; k < windowSize; k++) {
      for (let l = 0; l < windowSize; l++) {
        if (startOld + k < oldLines.length && startNew + l < newLines.length &&
            oldLines[startOld + k] === newLines[startNew + l]) {
          return [startOld + k, startNew + l]
        }
      }
    }
    return [-1, -1]
  }

  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      i++
      j++
    } else {
      const [nextOldMatch, nextNewMatch] = findNextMatch(i, j)
      if (nextOldMatch !== -1 && nextNewMatch !== -1) {
        diffBlocks.push({
          searchContent: oldLines.slice(i, nextOldMatch).join('\n'),
          replaceContent: newLines.slice(j, nextNewMatch).join('\n')
        })
        i = nextOldMatch
        j = nextNewMatch
      } else {
        // If no match found, add the rest of the content to the last diff block
        diffBlocks.push({
          searchContent: oldLines.slice(i).join('\n'),
          replaceContent: newLines.slice(j).join('\n')
        })
        break
      }
    }
  }

  // Trim trailing newlines and whitespace
  return diffBlocks.map(block => ({
    searchContent: block.searchContent.trimEnd(),
    replaceContent: block.replaceContent.trimEnd()
  })).filter(block => block.searchContent !== '' || block.replaceContent !== '')
}

export async function generateDiffs(
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[]
): Promise<{ searchContent: string; replaceContent: string }[]> {
  const expandedContent = await expandNewContent(oldContent, newContent, filePath, messageHistory)
  return generateDiffBlocks(oldContent, expandedContent)
}