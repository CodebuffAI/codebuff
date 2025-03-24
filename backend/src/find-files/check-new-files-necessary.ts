import { System } from '@/llm-apis/claude'
import { Message } from 'common/types/message'
import { CostMode, models } from 'common/constants'
import { promptGeminiWithFallbacks } from '@/llm-apis/gemini-with-fallbacks'

export const checkNewFilesNecessary = async (
  messages: Message[],
  system: System,
  clientSessionId: string,
  fingerprintId: string,
  userInputId: string,
  userPrompt: string,
  userId: string | undefined,
  costMode: CostMode
) => {
  const startTime = Date.now()
  const prompt = `
Considering the conversation history above, and the following user request, determine if new files should be read (YES or NO) to fulfill the request.

User request: ${userPrompt}

We'll need to read any files that should be modified to fulfill the user's request, or any files that could be helpful to read to answer the user's request. Broad user requests may require many files as context.

You should not read new files (NO) if:
- The user is following up on a previous request
- The user says something like "hi" with no specific request
- The user just wants to run a terminal command (e.g. "Run npm install")
- The request is purely about executing commands without needing file context
- The user wants to modify a specific file that is already loaded (check if the file path is mentioned)

However, you should read new files (YES) if:
- The user is asking something new that would benefit from new files being read
- The user's request requires understanding code or files not yet loaded
- We are at the beginning of a conversation and need context
- The user is asking about implementing new features or understanding existing ones
- The user wants to modify a file but we need to understand its dependencies or related files

Answer with just 'YES' if reading new files is helpful, or 'NO' if the current files are sufficient to answer the user's request. Do not write anything else.
`.trim()

  const response = await promptGeminiWithFallbacks(
    [...messages, { role: 'user', content: prompt }],
    system,
    {
      model: models.gemini2flash,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
      useGPT4oInsteadOfClaude: true,
    }
  )
  const endTime = Date.now()
  const duration = endTime - startTime
  const newFilesNecessary = response.trim().toUpperCase().includes('YES')
  return { newFilesNecessary, response, duration }
}
