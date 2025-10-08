import { publisher } from '../constants'
import type { SecretAgentDefinition } from '../types/secret-agent-definition'

const paramsSchema = {
  type: 'object' as const,
  properties: {
    prompts: {
      type: 'array' as const,
      items: { type: 'string' },
      description:
        'List of 1-4 different parts of the codebase that could be useful to explore',
    },
  },
  required: ['prompts'],
}

const inlineFileExplorer: SecretAgentDefinition = {
  id: 'inline-file-explorer',
  displayName: 'Inline File Explorer',
  spawnerPrompt:
    'Explores the codebase by spawning file pickers and reading all found files inline',
  model: 'anthropic/claude-sonnet-4.5',
  publisher,
  outputMode: 'last_message',
  toolNames: ['spawn_agents', 'read_files'],
  spawnableAgents: ['researcher-file-picker'],
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What you need to accomplish by exploring the codebase',
    },
    params: paramsSchema,
  },
  includeMessageHistory: true,
  inheritParentSystemPrompt: true,
  instructionsPrompt:
    'Please use the read_files tool to read all the files found by the file-picker agents in a single step, except for any files that are obviously not relevant.',

  handleSteps: function* ({ prompt, params }) {
    const prompts: string[] = params?.prompts ?? []
    const filePickerPrompts = prompts.map(
      (focusPrompt) =>
        `Based on the overall goal "${prompt}", find files related to this specific area: ${focusPrompt}`,
    )

    yield {
      toolName: 'spawn_agents',
      input: {
        agents: filePickerPrompts.map((promptText) => ({
          agent_type: 'researcher-file-picker',
          prompt: promptText,
        })),
      },
    }

    yield 'STEP'
  },
}

export default inlineFileExplorer
