import z from 'zod/v4'

import type { $ToolParams } from '../../constants'

const toolName = 'list_directory'
const endsAgentStep = true
export const listDirectoryParams = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      path: z
        .string()
        .describe('Directory path to list, relative to the project root.'),
    })
    .describe(
      'List files and directories in the specified path. Returns separate arrays of file names and directory names.',
    ),
  outputs: z.tuple([
    z.object({
      type: z.literal('json'),
      value: z.union([
        z.object({
          files: z.array(z.string()).describe('Array of file names'),
          directories: z.array(z.string()).describe('Array of directory names'),
          path: z.string().describe('The directory path that was listed'),
        }),
        z.object({
          errorMessage: z.string(),
        }),
      ]),
    }),
  ]),
} satisfies $ToolParams
