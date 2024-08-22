import { Message } from 'common/actions'
import { models, promptClaudeWithContinuation } from './claude'
import { debugLog } from './util/debug'

export async function editPrompt(
  userId: string,
  filePath: string,
  summary: string,
  oldContent: string,
  messageHistory: Message[]
): Promise<string> {
  const prompt = `You are an expert programmer tasked with editing a file based on a summary of changes. Your goal is to implement the changes described in the summary while preserving as much of the existing code structure as possible.

Here is the context from the previous conversation:
${messageHistory
  .map((msg) => `${msg.role}: ${JSON.stringify(msg.content)}`)
  .join('\n')}

File to edit: ${filePath}

Old file content:
${oldContent}

Summary of changes: ${summary}

Please provide the updated file content, using comments like "// ... existing code ..." to indicate unchanged sections. Only implement the changes described in the summary. Do not add, remove, or modify any code that is not explicitly mentioned in the summary.

Your response should only contain the updated file content, without any additional explanations or markdown formatting.`

  debugLog('Sending edit prompt to Claude:', prompt)

  const { response } = await promptClaudeWithContinuation(
    [{ role: 'user', content: prompt }],
    {
      userId,
      model: models.sonnet,
    }
  )

  debugLog('Received edit prompt response from Claude:', response)

  return response
}
