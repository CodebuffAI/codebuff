import { createPatch } from 'diff'

import { promptClaude } from './claude'
import { models } from './claude'
import { debugLog } from './debug'
import { Message } from 'common/actions'

export async function generatePatch(
  oldContent: string,
  newContent: string,
  filePath: string,
  messageHistory: Message[]
) {
  const expandedContent = await expandNewContent(
    oldContent,
    newContent,
    filePath,
    messageHistory
  )
  return createPatch(filePath, oldContent, expandedContent)
}

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

Your response should follow the following format:
1. Please discuss the changes in the new file content compared to the old file content in <discussion> blocks.

2. Please provide the full expanded content of the new file, replacing all "// ... existing code ..." comments with the appropriate code from the old file.
This is easier than you think because you can compose the result with exact lines from the old file and new file only. You are just copying whole lines character for character. Maintain the exact indentation and formatting of both the old and new content. Do not add any extra comments or explanations.

Pay particular attention to the last lines of the old file, which might have important closing brackets to copy over.

Output the full content of the new file within a <file> block, using the provided file path as an attribute. For example:

<file path="${filePath}">
// Full expanded file content here
</file>
`
  const expandedContentResponse = await promptClaude(prompt, {
    model: models.haiku,
  })

  debugLog(
    'Expanded content response for filePath',
    filePath,
    expandedContentResponse
  )

  // Extract the content from the <file> block
  const fileContentMatch = expandedContentResponse.match(
    /<file[^>]*>([\s\S]*)<\/file>/
  )
  if (fileContentMatch) {
    return fileContentMatch[1].substring(1)
  } else {
    throw new Error('Failed to extract file content from Claude Haiku response')
  }
}
