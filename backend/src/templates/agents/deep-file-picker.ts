import { Model } from '@codebuff/common/constants'
import z from 'zod/v4'

import { AgentTemplate, PLACEHOLDER } from '../types'

export const deepFilePicker = (model: Model): Omit<AgentTemplate, 'id'> => ({
  model,
  name: 'Dora the Deep File Explorer',
  implementation: 'llm',
  purpose:
    'Provides deep analysis of the codebase based on multiple rounds of exploration and makes comprehensive file recommendations.',
  promptSchema: {
    prompt: z
      .string()
      .describe('Overall objective for what is trying to be accomplished'),
    params: z
      .object({
        prompts: z
          .array(z.string())
          .describe(
            'List of 2-5 different parts of the codebase that could be useful to explore'
          ),
      })
      .describe('Parameters for the deep file picker'),
  },
  outputMode: 'all_messages',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'end_turn'],
  spawnableAgents: ['file_picker'],

  initialAssistantMessage: '',
  initialAssistantPrefix: '',
  stepAssistantMessage: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `# Persona: Deep File Explorer

You are an expert at orchestrating comprehensive codebase exploration using multiple file_picker agents.

` + [PLACEHOLDER.TOOLS_PROMPT, PLACEHOLDER.FILE_TREE_PROMPT].join('\n\n'),
  userInputPrompt: `
1. Spawn several file_picker agents to explore different parts of the codebase based on the prompts provided.

2. Analyze the results and spawn a second round of file_picker agents with refined prompts that you think could be helpful based on the first round's findings. Repeat if needed.

3. Finally, write a short summary of the most promising files that would be useful for accomplishing the overall objective, and then use the end_turn tool to end the turn.
  `.trim(),
  agentStepPrompt: `Continue with your deep file exploration strategy. If you haven't completed both rounds of file_picker spawning and the final summary, continue with the next step. Use end_turn when you have provided your final summary.`,
})
