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

You should read new files (YES) if:
- There are not yet any <read_files></read_files> tool calls or tool results in the conversation history, or if all the messages are from the user, and the user's request is not trivial, then it is strongly recommended to read new files.
- The user is asking something new that would benefit from new files being read
- The user's request requires understanding code or files not yet loaded
- The user is asking about implementing new features or understanding existing ones
- The user wants to modify a file but we need to understand its dependencies or related files

You should not read new files (NO) if:
- The user is following up on a previous request and no new files are needed
- The user says something like "hi" with no specific request
- The user just wants to run a terminal command (e.g. "run npm install" or for git, "undo my last commit")
- The request is purely about executing commands without needing file context
- The user wants to modify a specific file that is already loaded (check if the file path is mentioned)

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
