import { WebSocket } from 'ws'
import { CoreMessage } from 'ai'

import { AgentState, ToolResult } from 'common/types/agent-state'
import { ProjectFileContext } from 'common/util/file'
import { parseToolCalls, RawToolCall } from './tools'
import { getAgentStream } from './prompt-agent-stream'
import { sendAction } from './websockets/websocket-action'
import { getFilteredToolsInstructions } from './tools'

function getAgentSystemPrompt() {
  const toolsInstructions = getFilteredToolsInstructions('normal', true) // true for agent mode

  return `You are Codebuff operating in Agent Mode. Your goal is to accomplish the user's multi-step task autonomously through conversation.

Your primary method of interaction is through tools, especially \`run_terminal_command\`. When using \`run_terminal_command\`, always set the mode parameter to 'agent' for optimal autonomous execution. Analyze output carefully to decide subsequent actions.

Available tools: \`run_terminal_command\`, \`read_files\`, \`write_file\`, \`code_search\`, \`add_subgoal\`, \`update_subgoal\`, \`kill_terminal\`, \`sleep\`, \`end_turn\`.

**Self-Awareness of Codebuff:** You are an instance of Codebuff. You can modify your own source code located in \`/Users/jahooma/codebuff\`.

Key Codebuff files: \`backend/src/tools.ts\`, \`npm-app/src/cli.ts\`, \`npm-app/src/utils/terminal.ts\`, \`backend/src/agent-prompt.ts\`.

To build/test Codebuff: run \`bun run build && bun run test\` from the project root (\`/Users/jahooma/codebuff\`).

Terminal commands in agent mode will automatically wait for output to settle (0.5 seconds of no new output) or timeout based on the timeout_seconds parameter. If a command times out, the terminal will NOT be killed - you'll just get the output captured so far. Use \`kill_terminal\` if you need to forcefully restart the terminal.

Use \`sleep\` to pause execution for a specified number of seconds when needed.

Use \`add_subgoal\` and \`update_subgoal\` to create a plan and track your progress for complex tasks.

Explain your plan, actions, and results clearly in your response before calling tools.

Use \`end_turn\` when you have completed the current request or need user input to proceed.

Focus on achieving the user's task. Be methodical. If a step fails, try to understand why and correct it.

You are in a conversational mode - the user will give you tasks and you should work on them step by step, asking for clarification when needed.

${toolsInstructions}`
}


interface AgentPromptAction {
  type: 'agent-prompt'
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

export async function handleAgentPrompt(
  ws: WebSocket,
  action: AgentPromptAction,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void,
  fileContext: ProjectFileContext
): Promise<void> {
  let currentMessageHistory: CoreMessage[]

  // Check if this is the first message in agent mode, a new user prompt, or tool results
  if (action.agentState.messageHistory.length === 0 && action.prompt) {
    // First time entering agent mode - initialize with system prompt
    currentMessageHistory = [
      { role: 'system', content: getAgentSystemPrompt() },
      { role: 'user', content: action.prompt },
    ]
  } else if (action.prompt) {
    // New user message in existing conversation
    currentMessageHistory = [
      ...action.agentState.messageHistory,
      { role: 'user', content: action.prompt },
    ]
  } else {
    // Tool results only - continue from existing history
    currentMessageHistory = [...action.agentState.messageHistory]
  }

  // If we have tool results, add them as system message
  if (action.toolResults.length > 0) {
    const toolResultsXml = action.toolResults
      .map(
        (result) =>
          `<tool_result name="${result.name}" id="${result.id}">${result.result}</tool_result>`
      )
      .join('\n')

    currentMessageHistory.push({
      role: 'user',
      content: `<system>${toolResultsXml}</system>`,
    })
  }

  // Get agent stream
  const costMode = action.costMode || 'normal'
  const model = action.model

  const { getStream } = getAgentStream({
    costMode: costMode as any,
    selectedModel: model,
    stopSequences: ['</run_terminal_command>'],
    clientSessionId,
    fingerprintId: action.fingerprintId,
    userInputId: 'agent-' + Date.now(),
    userId,
  })

  let fullResponse = ''
  const toolCalls: RawToolCall[] = []

  try {
    const stream = getStream(currentMessageHistory)

    for await (const chunk of stream) {
      fullResponse += chunk
      onResponseChunk(chunk)

      // Parse for complete tool calls
      const newToolCalls = parseToolCalls(fullResponse)
      if (newToolCalls.length > toolCalls.length) {
        // Add new tool calls
        toolCalls.push(...newToolCalls.slice(toolCalls.length))
      }
    }

    // Append assistant message to history
    currentMessageHistory.push({
      role: 'assistant',
      content: fullResponse,
    })

    // Update agent state
    const updatedAgentState: AgentState = {
      ...action.agentState,
      messageHistory: currentMessageHistory,
    }

    if (toolCalls.length > 0) {
      // Send tool calls to client for execution
      sendAction(ws, {
        type: 'agent_request_tool_execution',
        toolCalls: toolCalls.map((tc) => ({
          name: tc.name,
          parameters: tc.parameters,
          id: tc.name + '-' + Date.now(), // Generate ID since RawToolCall doesn't have one
        })),
        agentState: updatedAgentState,
      })
    } else {
      // No tool calls, agent is done or waiting for user input
      // This would be handled by the client showing the response
    }
  } catch (error) {
    console.error('Error in agent prompt handling:', error)
    onResponseChunk(
      `\n\nError: ${error instanceof Error ? error.message : 'Unknown error occurred'}`
    )
  }
}
