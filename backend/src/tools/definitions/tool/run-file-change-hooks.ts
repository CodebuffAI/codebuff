import type { CodebuffToolDef } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/constants/tools'
import z from 'zod/v4'

const toolName = 'run_file_change_hooks'
const endsAgentStep = true
export const runFileChangeHooksTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      files: z
        .array(z.string())
        .describe(
          `List of file paths that were changed and should trigger file change hooks`
        ),
    })
    .describe(
      `Trigger file change hooks on the client for the specified files. This should be called after file changes have been applied.`
    ),
  description: `
Purpose: Trigger file change hooks defined in codebuff.json for the specified files. This tool allows the backend to request the client to run its configured file change hooks (like tests, linting, type checking) after file changes have been applied.

Use cases:
- After making code changes, trigger the relevant tests and checks
- Ensure code quality by running configured linters and type checkers
- Validate that changes don't break the build

The client will run only the hooks whose filePattern matches the provided files.

Example:
${getToolCallString(
  toolName,
  {
    files: ['src/components/Button.tsx', 'src/utils/helpers.ts'],
  },
  endsAgentStep
)}
    `.trim(),
} satisfies CodebuffToolDef
