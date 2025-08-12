import z from 'zod/v4'

import type { ToolParams } from '../../constants'

const toolName = 'write_file'
const endsAgentStep = false
export const writeFileParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      path: z
        .string()
        .min(1, 'Path cannot be empty')
        .describe(`Path to the file relative to the **project root**`),
      instructions: z
        .string()
        .describe('What the change is intended to do in only one sentence.'),
      content: z.string().describe(`Edit snippet to apply to the file.`),
    })
    .describe(`Create or edit a file with the given content.`),
} satisfies ToolParams
