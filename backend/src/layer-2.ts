import { WebSocket } from 'ws'
import { Message } from 'common/actions'
import { ProjectFileContext } from 'common/util/file'
import { getSystemPrompt } from './system-prompt'
import { promptClaudeStream, System } from './claude'
import { assert } from 'common/util/object'
import { requestAdditionalFiles } from './request-files-prompt'

export const layer2 = async (
  ws: WebSocket,
  userId: string,
  messages: Message[],
  fileContext: ProjectFileContext,
  onResponseChunk: (chunk: string) => void
) => {
  const lastMessage = messages[messages.length - 1]
  assert(
    lastMessage.role === 'user' && typeof lastMessage.content === 'string',
    'Last message must be from user and must be a string ' +
      `(got ${lastMessage.role} with content type ${typeof lastMessage.content})`
  )
  const userMessage = lastMessage.content
  const previousMessages = messages.slice(0, -1)

  const system = getSystemPrompt(fileContext, {
    checkFiles: true,
  })

  const [files, codeReviewResponse, brainstormResponse, choosePlanInfo] =
    await Promise.all([
      requestAdditionalFiles(ws, { messages, system }, fileContext, userId),
      codeReviewPrompt(userId, system, previousMessages, userMessage).catch(
        (error) => {
          console.error('Error in code review prompt:', error)
          return ''
        }
      ),
      brainstormPrompt(userId, system, previousMessages, userMessage).catch(
        (error) => {
          console.error('Error in brainstorm prompt:', error)
          return ''
        }
      ),
      choosePlanPrompt(
        userId,
        system,
        previousMessages,
        userMessage,
        onResponseChunk
      ).catch((error) => {
        console.error('Error in choose plan prompt:', error)
        return { fullResponse: '', uncertaintyScore: 0, chosenPlan: 'PAUSE' }
      }),
    ])

  return {
    files,
    codeReviewResponse,
    brainstormResponse,
    choosePlanInfo,
  }
}

const codeReviewPrompt = async (
  userId: string,
  system: System,
  previousMessages: Message[],
  userMessage: string
) => {
  const prompt = `
<user_message>${userMessage}</user_message>

Please review the files and provide a detailed analysis of the code within <code_review> blocks, especially as it relates to the user's request. Then stop.
`.trim()

  const messages = [
    ...previousMessages,
    { role: 'user' as const, content: prompt },
    { role: 'assistant' as const, content: '<code_review>' },
  ]

  const stream = promptClaudeStream(messages, {
    system,
    userId,
  })
  let fullResponse = ''
  for await (const chunk of stream) {
    fullResponse += chunk
  }
  return fullResponse
}

const brainstormPrompt = async (
  userId: string,
  system: System,
  previousMessages: Message[],
  userMessage: string
) => {
  const prompt = `
<user_message>${userMessage}</user_message>

Please brainstorm ideas to solve the user's request in a <brainstorm> block. Try to list several independent ideas. Then stop.
`.trim()

  const messages = [
    ...previousMessages,
    { role: 'user' as const, content: prompt },
    { role: 'assistant' as const, content: '<brainstorm>' },
  ]

  const stream = promptClaudeStream(messages, {
    system,
    userId,
  })
  let fullResponse = ''
  for await (const chunk of stream) {
    fullResponse += chunk
  }
  return fullResponse
}

const possiblePlans = ['PROCEED', 'PAUSE', 'GATHER_MORE_INFO'] as const
type PossiblePlan = (typeof possiblePlans)[number]

const choosePlanPrompt = async (
  userId: string,
  system: System,
  previousMessages: Message[],
  userMessage: string,
  onResponseChunk: (chunk: string) => void
) => {
  const prompt = `
<user_message>${userMessage}</user_message> 

Please discuss how much uncertainty or ambiguity there is in fulfilling the user's request and knowing what plan they would like most.

Then, write out an <uncertainty_score> block that contains an uncertainty score between 0 (no ambiguity) and 100 (high ambiguity) that you know what the user wants and can implement the plan they would like most.

Finally, we need to choose a plan to address the level of uncertainty. We can either:

- PROCEED with a solution
- PAUSE to ask the user for more information, or
- GATHER_MORE_INFO by reading files or running commands

Please write out a <chosen_plan> block that contains "PROCEED", "PAUSE", or "GATHER_MORE_INFO".
`.trim()

  const stream = promptClaudeStream(
    [...previousMessages, { role: 'user', content: prompt }],
    {
      system,
      userId,
    }
  )
  let fullResponse = ''
  for await (const chunk of stream) {
    fullResponse += chunk
    onResponseChunk(chunk as string)
  }
  const { uncertaintyScore, chosenPlan } = parseChoosePlanPrompt(fullResponse)
  return { fullResponse, uncertaintyScore, chosenPlan }
}

const parseChoosePlanPrompt = (response: string) => {
  const uncertaintyScoreRegex = /<uncertainty_score>(.*?)<\/uncertainty_score>/
  const chosenPlanRegex = /<chosen_plan>(.*?)<\/chosen_plan>/

  const uncertaintyScoreMatch = response.match(uncertaintyScoreRegex)
  const chosenPlanMatch = response.match(chosenPlanRegex)

  if (!uncertaintyScoreMatch || !chosenPlanMatch) {
    throw new Error('Could not parse choose plan prompt')
  }
  const uncertaintyScore = parseInt(uncertaintyScoreMatch[1], 10)
  const chosenPlanStr = chosenPlanMatch[1] as PossiblePlan
  const chosenPlan = possiblePlans.includes(chosenPlanStr)
    ? chosenPlanStr
    : ('PAUSE' as const)

  return { uncertaintyScore, chosenPlan }
}
