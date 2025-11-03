import { publisher } from './constants'
import type {
  AgentDefinition,
  AgentStepContext,
} from './types/agent-definition'

const commander: AgentDefinition = {
  id: 'commander',
  publisher,
  model: 'anthropic/claude-haiku-4.5',
  displayName: 'Commander',
  spawnerPrompt:
    'Runs a single terminal command and describes its output based on what information is requested.',
  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What information from the command output is desired. Be specific about what to look for or extract.',
    },
    params: {
      type: 'object',
      properties: {
        command: {
          type: 'string',
          description: 'Terminal command to run',
        },
        timeout_seconds: {
          type: 'number',
          description:
            'Set to -1 for no timeout. Default 30',
        },
      },
      required: ['command'],
    },
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['run_terminal_command'],
  systemPrompt: `You are an expert at running terminal commands and analyzing their output.

Your job is to:
1. Run the terminal commands provided
2. Analyze the output based on what the user requested
3. Provide a clear, concise description of the relevant information

When describing command output:
- Use excerpts from the actual output when possible (especially for errors, key values, or specific data)
- Focus on the information the user requested
- Be concise but thorough
- If the output is very long, summarize the key points rather than reproducing everything
- Don't include any follow up recommendations, suggestions, or offers to help`,
  instructionsPrompt: `The user has provided a command to run and specified what information they want from the output.

Run the command and then describe the relevant information from the output, following the user's instructions about what to focus on.`,
  handleSteps: function* ({ params }: AgentStepContext) {
    const command = params?.command as string | undefined
    if (!command) {
      return
    }

    const timeout_seconds = params?.timeout_seconds as number | undefined

    // Run the command
    yield {
      toolName: 'run_terminal_command',
      input: {
        command,
        ...(timeout_seconds !== undefined && { timeout_seconds }),
      },
    }

    // Let the model analyze and describe the output
    yield 'STEP_ALL'
  },
}

export default commander
