import { publisher } from '../.agents/constants'
import { type SecretAgentDefinition } from '../.agents/types/secret-agent-definition'

import type { Message } from '../.agents/types/util-types'

const editor: SecretAgentDefinition = {
  id: 'editor',
  publisher,
  model: 'anthropic/claude-sonnet-4.5',
  displayName: 'Code Editor',
  spawnerPrompt:
    'Expert code editor with access to tools to find and edit files, run terminal commands, and search the web. Can handle small to medium sized tasks, or work off of a plan for more complex tasks. For easy tasks, you can spawn this agent directly rather than invoking a researcher or planner first. Spawn mulitple in parallel if needed, but only on totally distinct tasks.',
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'The coding task to implement',
    },
    params: {
      type: 'object',
      properties: {
        maxContextLength: {
          type: 'number',
        },
      },
      required: [],
    },
  },
  outputMode: 'structured_output',
  toolNames: [
    'read_files',
    'write_file',
    'str_replace',
    'run_terminal_command',
    'code_search',
    'spawn_agents',
    'add_message',
    'set_output',
    'end_turn',
  ],
  spawnableAgents: ['file-explorer', 'researcher-web', 'researcher-docs'],

  includeMessageHistory: true,
  inheritParentSystemPrompt: true,

  instructionsPrompt: `You are an expert code editor with deep understanding of software engineering principles.

Implement the requested changes, using your judgment as needed, but referring to the original <user_message> as the most important source of information.

# Instructions

- Read any relevant files that have not already been read. Or, spawn a file-explorer to find any other relevant parts of the codebase.
- Implement changes using str_replace or write_file.
- Verify your changes by running tests, typechecking, etc. Keep going until you are sure the changes are correct.
- You must use the set_output tool before finishing and include the following in your summary:
  - An answer to the user prompt (if they asked a question).
  - An explanation of the changes made.
  - A note on any checks you ran to verify the changes, such as tests, typechecking, etc., and the results of those checks.
  - Do not include a section on the benefits of the changes, as we're most interested in the changes themselves and what still needs to be done.
- Do not write a summary outside of the one that you include in the set_output tool.
- As soon as you use set_output, you must end your turn using the end_turn tool.
`,

  handleSteps: function* ({ agentState: initialAgentState }) {
    const stepLimit = 25
    let stepCount = 0
    let agentState = initialAgentState
    let accumulatedEditToolResults: any[] = []

    while (true) {
      stepCount++

      const stepResult = yield 'STEP'
      agentState = stepResult.agentState // Capture the latest state

      // Accumulate new tool messages from this step
      const { messageHistory } = agentState

      // Extract and accumulate new edit tool results using helper function
      accumulatedEditToolResults.push(
        ...getLatestEditToolResults(messageHistory),
      )

      if (stepResult.stepsComplete) {
        break
      }

      // If we've reached within one of the step limit, ask LLM to summarize progress
      if (stepCount === stepLimit - 1) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'You have reached the step limit. Please use the set_output tool now to summarize your progress so far including all specific actions you took (note that any file changes will be included automatically in the output), what you still need to solve, and provide any insights that could help complete the remaining work. Please end your turn after using the set_output tool with the end_turn tool.',
          },
          includeToolCall: false,
        }

        // One final step to produce the summary
        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState

        // Extract and accumulate final edit tool results using helper function
        accumulatedEditToolResults.push(
          ...getLatestEditToolResults(agentState.messageHistory),
        )
        break
      }
    }

    yield {
      toolName: 'set_output',
      input: {
        ...agentState.output,
        edits: accumulatedEditToolResults,
      },
      includeToolCall: false,
    }

    function getLatestEditToolResults(messageHistory: Message[]) {
      const lastAssistantMessageIndex = messageHistory.findLastIndex(
        (message) => message.role === 'assistant',
      )

      // Get all edit tool messages after the last assistant message
      const newToolMessages = messageHistory
        .slice(lastAssistantMessageIndex + 1)
        .filter((message) => message.role === 'tool')
        .filter(
          (message) =>
            message.toolName === 'write_file' ||
            message.toolName === 'str_replace',
        )

      // Extract and return new edit tool results
      return (
        newToolMessages
          .flatMap((message) => message.content)
          .filter((output) => output.type === 'json')
          .map((output) => output.value)
          // Only successful edits!
          .filter(
            (toolResult) =>
              toolResult && !('errorMessage' in (toolResult as any)),
          )
      )
    }
  },
}

export default editor
