import { CostMode, models } from 'common/constants'
import { Message } from 'common/types/message'

import { System } from '@/llm-apis/claude'
import { promptFlashWithFallbacks } from '@/llm-apis/gemini-with-fallbacks'
import { getMessagesSubset } from '@/util/messages'

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
  const systemWithCodebuffInfo = `${systemIntro}\n\n${system}`
  const prompt = `
Considering the conversation history above, and the following user request (in quotes), determine if new files should be read (YES or NO) to fulfill the request.

User request: ${JSON.stringify(userPrompt)}

We'll need to read any files that should be modified to fulfill the user's request, or any files that could be helpful to read to answer the user's request. Broad user requests may require many files as context.

You should read new files (YES) if:
- There are not yet any <read_files></read_files> tool calls or tool results in the conversation history
- There's only one message from the user.
- The user is asking something new that would benefit from new files being read.
- The user moved on to a different topic.
- The user followed up mentioning new files or functions where reading new files would be helpful.
- The user's request requires understanding code or files not yet loaded
- The user is asking about implementing new features or understanding existing ones
- The user wants to modify a file but we need to understand its dependencies or related files

You should not read new files (NO) if:
- The user is following up on a previous request and no new files are needed
- The user wants to modify a specific file that is already loaded (check if the file path is mentioned)
- The user says something like "hi" or "hello" with no specific request
- The user just wants to run a straight-forward terminal command (e.g. "run npm install")
- The request is purely about executing commands without needing file context
- The request is about the Codebuff application itself: which LLM model is being used, how many credits have been used, asking to revert to a checkpoint or undo a change, etc.

Answer with just 'YES' if reading new files is helpful, or 'NO' if the current files are sufficient to answer the user's request. Do not write anything else.
`.trim()

  const bufferTokens = 100_000
  const response = await promptFlashWithFallbacks(
    getMessagesSubset(
      [...messages, { role: 'user', content: prompt }],
      bufferTokens
    ),
    systemWithCodebuffInfo,
    {
      model: models.gemini2flash,
      clientSessionId,
      fingerprintId,
      userInputId,
      userId,
      costMode,
    }
  )
  const endTime = Date.now()
  const duration = endTime - startTime
  const newFilesNecessary = response.trim().toUpperCase().includes('YES')
  return { newFilesNecessary, response, duration }
}

const systemIntro = `
You are assisting the user with their software project, in the application Codebuff. Codebuff is a coding agent that helps developers write code or perform utility tasks.
`.trim()
