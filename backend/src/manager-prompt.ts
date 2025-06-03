import { WebSocket } from 'ws'
import { CoreMessage } from 'ai'

import { AgentState, ToolResult } from 'common/types/agent-state'
import { ProjectFileContext } from 'common/util/file'
import {
  ClientToolCall,
  getManagerToolsInstructions,
  parseRawToolCall,
  TOOL_LIST,
  ToolName,
  ToolCall,
} from './tools'
import { getAgentStream } from './prompt-agent-stream'
import { logger } from './util/logger'
import { generateCompactId } from 'common/util/string'
import { processStreamWithTags } from './xml-stream-parser'
import { getToolCallString, toolSchema } from 'common/constants/tools'

function getManagerSystemPrompt() {
  const toolsInstructions = getManagerToolsInstructions()

  return `You are a highly capable agent that oversees software projects. You are good at working at a high level and prompting the coding agent, Codebuff, to accomplish tasks. Your goal is to accomplish the user's multi-step task autonomously through conversation.

Your primary method of interaction is through tools, especially \`run_terminal_command\`.

Terminal commands will automatically wait for output to settle (0.5 seconds of no new output) or timeout based on the timeout_seconds parameter. If a command times out, the terminal will NOT be killed - you'll just get the output captured so far. Use \`kill_terminal\` if you need to forcefully restart the terminal.

Use \`sleep\` to pause execution for a specified number of seconds when needed.

Explain your plan, actions, and results clearly in your response before calling tools.

Focus on achieving the user's task. Be methodical. If a step fails, try to understand why and correct it.

You are in a conversational mode - the user will give you tasks and you should work on them step by step, asking for clarification when needed.

# Codebuff

Codebuff is an expert AI coding agent that helps developers edit code through natural language conversation. Codebuff can be invoked from the terminal to get help with coding tasks, from simple edits to complex refactoring and feature implementation.

Invoke Codebuff like this from the root of your project:
${getToolCallString('run_terminal_command', {
  command: 'codebuff --lite',
  timeout_seconds: '300',
  process_type: 'SYNC',
})}

(We use --lite to use a more economical model. You can also start with 'codebuff --ask' to begin in ask mode if you don't want to change files yet.)

This opens a shell where you can interact with Codebuff. You can also run commands directly in the shell. Then you can enter your prompt as a command.

You can send prompts in natural language directly, e.g.:
${getToolCallString('run_terminal_command', {
  command: 'Add a console.log to the start of the npm index file',
  timeout_seconds: '300',
  process_type: 'SYNC',
})}

Codebuff will go and make the change and stream it's thought process as well as the tools it is using. This can take a few seconds or a few minutes. It's best to give it a long timeout, because if it finishes early it will return results back immediately. If it doesn't finish in time, you can sleep for longer to give it more time, or kill the terminal and try again.

You should expect to guide Codebuff over multiple prompts. When it goes off track, you should guide it back to the task at hand.

However, Codebuff is a highly capable agent that is an expert at understanding complex codebases. Instead of trying to figure out the codebase on your own, you should ask Codebuff or prompt Codebuff to just make the change and let it figure out which files to edit and how.

DO NOT run grep or find commands to try to locate files or understand the codebase. Instead, you should ask Codebuff your questions.

Inside Codebuff, you can use special commands that have various effects, e.g.:

${getToolCallString('run_terminal_command', {
  command: 'help',
  timeout_seconds: '10',
  process_type: 'SYNC',
})}

Selected commands:
- help: Help with Codebuff, including tips and a list of all commands
- ask: Enter a mode to ask questions. Codebuff will not make any changes to the project while in this mode. It's a good idea to start here when fleshing out a plan.
- lite: Switch back to lite mode where Codebuff can make changes to the project
- diff: For each file changed in the most recent response, show the diff
- reset: Reset the conversation history (helps if Codebuff gets off track)
- exit: Exit Codebuff

You can also run any terminal command within Codebuff by prefixing with the '!' character. For example:
${getToolCallString('run_terminal_command', {
  command: '!ls -la',
  timeout_seconds: '10',
  process_type: 'SYNC',
})}

You should prefer running commands this way if you are already in Codebuff. No need to exit to run terminal commands.

# Tools

${toolsInstructions}`
}

interface ManagerPromptAction {
  type: 'manager-prompt'
  prompt?: string // Optional for tool result responses
  agentState: AgentState
  toolResults: ToolResult[]
  fingerprintId: string
  authToken?: string
  costMode?: string
  model?: string
  cwd?: string
  repoName?: string
}

export async function handleManagerPrompt(
  ws: WebSocket,
  action: ManagerPromptAction,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void,
  fileContext: ProjectFileContext
): Promise<{
  toolCalls: ClientToolCall[]
  toolResults: ToolResult[]
  agentState: AgentState
}> {
  const messages: CoreMessage[] = [...action.agentState.messageHistory]

  // Check if this is the first message in agent mode, a new user prompt, or tool results
  if (messages.length === 0) {
    logger.debug(
      { userId },
      'First time entering manager mode - initializing with system prompt'
    )
    // First time entering agent mode - initialize with system prompt
    messages.push({
      role: 'system',
      content: getManagerSystemPrompt(),
    })
  }
  // If we have tool results, add them as system message
  if (action.toolResults.length > 0) {
    const toolResultsXml = action.toolResults
      .map(
        (result) =>
          `<tool_result name="${result.name}" id="${result.id}">${result.result}</tool_result>`
      )
      .join('\n')

    messages.push({
      role: 'user',
      content: `<system>${toolResultsXml}</system>`,
    })
  }

  if (action.prompt) {
    messages.push({ role: 'user', content: action.prompt })
  }

  // Get manager stream
  const costMode = action.costMode || 'normal'
  const model = action.model

  logger.debug(
    { model, messages, toolResults: action.toolResults },
    'Manager prompt'
  )

  const { getStream } = getAgentStream({
    costMode: costMode as any,
    selectedModel: model,
    stopSequences: ['</run_terminal_command>', '</sleep>', '</kill_terminal>'],
    clientSessionId,
    fingerprintId: action.fingerprintId,
    userInputId: 'agent-' + Date.now(),
    userId,
  })

  const stream = getStream(messages)

  const allToolCalls: ToolCall[] = []
  const clientToolCalls: ClientToolCall[] = []
  const serverToolResults: ToolResult[] = []

  function toolCallback<T extends ToolName>(
    tool: T,
    after: (toolCall: Extract<ToolCall, { name: T }>) => void
  ): {
    params: (string | RegExp)[]
    onTagStart: () => void
    onTagEnd: (
      name: string,
      parameters: Record<string, string>
    ) => Promise<void>
  } {
    return {
      params: toolSchema[tool],
      onTagStart: () => {},
      onTagEnd: async (_: string, parameters: Record<string, string>) => {
        const toolCall = parseRawToolCall({
          name: tool,
          parameters,
        })
        if ('error' in toolCall) {
          serverToolResults.push({
            name: tool,
            id: generateCompactId(),
            result: toolCall.error,
          })
          return
        }
        allToolCalls.push(toolCall as Extract<ToolCall, { name: T }>)

        after(toolCall as Extract<ToolCall, { name: T }>)
      },
    }
  }
  const streamWithTags = processStreamWithTags(
    stream,
    {
      ...Object.fromEntries(
        TOOL_LIST.map((tool) => [tool, toolCallback(tool, () => {})])
      ),
      ...Object.fromEntries(
        (['sleep', 'kill_terminal'] as const).map((tool) => [
          tool,
          toolCallback(tool, (toolCall) => {
            clientToolCalls.push({
              ...toolCall,
              id: generateCompactId(),
            } as ClientToolCall)
          }),
        ])
      ),
      run_terminal_command: toolCallback('run_terminal_command', (toolCall) => {
        const clientToolCall = {
          ...{
            ...toolCall,
            parameters: {
              ...toolCall.parameters,
              mode: 'manager' as const,
            },
          },
          id: generateCompactId(),
        }
        clientToolCalls.push(clientToolCall)
      }),
    },
    (name, error) => {
      serverToolResults.push({ id: generateCompactId(), name, result: error })
    }
  )

  let fullResponse = ''

  for await (const chunk of streamWithTags) {
    fullResponse += chunk
    onResponseChunk(chunk)
  }

  messages.push({
    role: 'assistant',
    content: fullResponse,
  })

  // Update agent state
  const updatedAgentState: AgentState = {
    ...action.agentState,
    messageHistory: messages,
  }
  logger.debug(
    {
      prompt,
      messages,
      toolCalls: allToolCalls,
      serverToolResults,
      clientToolCalls,
      model,
    },
    'Manager prompt response'
  )

  return {
    agentState: updatedAgentState,
    toolCalls: clientToolCalls,
    toolResults: [],
  }
}
