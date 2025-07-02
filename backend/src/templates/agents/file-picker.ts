import { Model } from '@codebuff/common/constants'
import { AgentTemplateTypes } from '@codebuff/common/types/session-state'
import { z } from 'zod/v4'
import { getToolCallString } from '@codebuff/common/constants/tools'
import { generateCloseTags } from '../../util/parse-tool-call-xml'
import { AgentTemplate, PLACEHOLDER } from '../types'
import { logger } from '../../util/logger'

const paramsSchema = z.object({
  files_to_find: z
    .array(z.string())
    .describe(
      'Please provide up to 4 different prompts that describe varied portions of the codebase that would be helpful to find files for.'
    ),
})

export const filePicker = (model: Model): Omit<AgentTemplate, 'type'> => ({
  model,
  description:
    'Expert at finding relevant files in a codebase. Prompt it with some underlying context about what you are trying to do and secondly provide a few different prompts that describe varied portions of the codebase that would be helpful to find files for.',
  promptSchema: {
    prompt: true,
    params: paramsSchema,
  },
  outputMode: 'last_message',
  includeMessageHistory: false,
  toolNames: ['spawn_agents', 'read_files', 'end_turn'],
  stopSequences: generateCloseTags(['end_turn']),
  spawnableAgents: [AgentTemplateTypes.file_picker_worker],

  initialAssistantMessage: (
    prompt: string | undefined,
    params: z.infer<typeof paramsSchema>
  ) => {
    logger.info({ prompt, params }, 'initialAssistantMessage')
    const spawnToolCalls = getToolCallString('spawn_agents', {
      agents: params.files_to_find.map((filePrompt) => ({
        agent_type: AgentTemplateTypes.file_picker_worker,
        prompt: `${prompt}. Find files about: q${filePrompt}`,
      })),
    })
    return spawnToolCalls
  },
  // onEndAssistantMessage: (agentState) => {
  //   return '<update_report>...</update_report>' // New assistant message
  // },
  initialAssistantPrefix: '',
  stepAssistantPrefix: '',

  systemPrompt:
    `You are an expert at finding relevant files in a codebase.\n\n` +
    [PLACEHOLDER.TOOLS_PROMPT, PLACEHOLDER.FILE_TREE_PROMPT].join('\n\n'),

  userInputPrompt: `
 1. Spawn a few file_picker_worker agents, each with a different prompt that focuses on a different aspect of the codebase.
 2. Based on the file_picker_worker agents' responses, use the read_files tool to read all the relevant files.
 3. Use the end_turn tool.

 Don't write anything else other than these three tool calls!
 `.trim(),

  agentStepPrompt: 'You must call both the read_files and end_turn tools back-to-back in the same response.',
})
