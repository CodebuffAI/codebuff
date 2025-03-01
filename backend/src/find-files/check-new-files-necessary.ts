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
  previousFiles: string[],
  userPrompt: string,
  userId: string | undefined,
  costMode: CostMode
) => {
  const startTime = Date.now()
  const prompt = `
Considering the conversation history above, and the following user request, determine if new files should be read (YES or NO) to fulfill the request.

Current files read: ${previousFiles.length > 0 ? previousFiles.join(', ') : 'None'}
User request: ${userPrompt}

We'll need to read any files that should be modified to fulfill the user's request, or any files that could be helpful to read to answer the user's request.
- Broad user requests may require many files as context.
- If there are not many files read (e.g. only knowledge files), lean towards reading more files.

You should not read new files (NO) if:
- The user is following up on a previous request
- The user says something like "hi" with no specific request
- The user asks to edit a file you are already reading
- You just need to run a terminal command

If the user is asking something new or that would likely benefit from new files being read or if there is a way to provide a better answer by reading more files, you should read new files (YES).

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
