import { Message } from 'common/actions'
import { models, promptClaudeWithContinuation } from './claude'
import { debugLog } from './util/debug'
import { createFileBlock } from 'common/util/file'
import { TextBlockParam, Tool } from '@anthropic-ai/sdk/resources'

export async function editPrompt(
  userId: string,
  system: string | Array<TextBlockParam>,
  tools: Tool[],
  messageHistory: Message[],
  partialResponse: string,
  filePath: string,
  editSummary: string,
  oldContent: string
): Promise<string> {
  console.log('editPrompt', filePath)
  const prompt =
    `You are an expert programmer tasked with editing a file based on a conversation with the user.

Old file content:
${createFileBlock(filePath, oldContent)}

Summary of changes to be made:
${createFileBlock(filePath, editSummary)}

Please provide the complete new file content in a file block, using comments like "// ... existing code ..." to indicate unchanged sections. 

Your response should only contain the updated file content in a file block, without any additional explanations or markdown formatting. Do not use any tools.

Be mindful that you are providing instructions on how to modify an existing file, and another assistant will implement the changes, so make the changes as clear as possible. Shorter instructions are preferred.

When modifying an existing file, try to excerpt only the section you are actually changing.

${createFileBlock(
  'path/to/existing/file.tsx',
  `// ... existing imports and code ...

function getDesktopNav() {
  console.log('I\'ve just edited in this console.log statement')

  // ... existing code ...
}

// ... existing code ...
`
)}

As in this example, do not reproduce long continuous sections of the file which are unchanged: instead, use the placeholder comment "// ... existing code ..." to indicate where existing code should be preserved.

Be sure to give enough lines of context around the code you are editing so that the other assistant can make the edit in the correct place. But adding more than 2-3 lines of context is probably unnecessary.

When editing a file, if the file starts with imports that you are not changing, then start the file with "// ... existing imports ..." or "# ... existing imports ...".

<important_instruction>
Don't forget to add the placeholder comment "// ... existing code ..." between any sections of code you are editing. If you don't, then all the code in between will be deleted!
</important_instruction>
`.trim()

  const messagesWithPartialResponse = [
    ...messageHistory,
    { role: 'assistant' as const, content: partialResponse },
    { role: 'user' as const, content: prompt },
  ]

  console.log('Sending edit prompt to Claude for', filePath, editSummary)
  debugLog('Sending edit prompt to Claude for', filePath, editSummary)

  const { response } = await promptClaudeWithContinuation(
    messagesWithPartialResponse,
    {
      userId,
      model: models.sonnet,
      tools,
      system,
      checkComplete: (response: string) => {
        return response.includes('<' + '/file>')
      },
    }
  )

  debugLog('Received edit prompt response from Claude:', response)

  return response
}
