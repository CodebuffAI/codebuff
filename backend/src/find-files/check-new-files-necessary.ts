import { System } from '@/claude'
import { promptOpenAI, OpenAIMessage } from '@/openai-api'
import { Message } from 'common/actions'
import { CostMode, models } from 'common/constants'
import { promptGemini } from '@/gemini-api'
import { messagesWithSystem } from '@/util/messages'
import { logger } from '@/util/logger'

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

We'll need to read any files that should be modified to fulfill the user's request, or any files that could be helpful to read to answer the user's request. Broad user requests may require many files as context.

If the user is asking something different than before or that would likely benefit from new files being read, you should read new files (YES).

You should not read new files (NO) if:
- The user is following up on a previous request
- The user says something like "hi" with no specific request
- The user asks to edit a file you are already reading
- You just need to run a terminal command

Lean towards reading new files (YES) if you are not sure as that is a less costly error.

Answer with just 'YES' if reading new files is necessary, or 'NO' if the current files are sufficient to answer the user's request. Do not write anything else.
`.trim()

  try {
    // First try Vertex AI's Gemini
    const response = await promptGemini(
      messagesWithSystem(
        [...messages, { role: 'user', content: prompt }],
        system
      ),
      {
        model: models.gemini2flash,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
      }
    )
    const endTime = Date.now()
    const duration = endTime - startTime
    const newFilesNecessary = response.trim().toUpperCase().includes('YES')
    return { newFilesNecessary, response, duration }
  } catch (error) {
    logger.error(
      { error },
      'Error calling Gemini API, falling back to GPT-4'
    )
    const response = await promptOpenAI(
      [...(messages as OpenAIMessage[]), { role: 'user', content: prompt }],
      {
        model: costMode === 'lite' ? models.gpt4omini : models.gpt4o,
        clientSessionId,
        fingerprintId,
        userInputId,
        userId,
      }
    )
    const endTime = Date.now()
    const duration = endTime - startTime
    const newFilesNecessary = response.trim().toUpperCase().includes('YES')
    return { newFilesNecessary, response, duration }
  }
}
