import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'run_file_change_hooks'
const endsAgentStep = true
export const runFileChangeHooksTool = {
  toolName,
  description: `
Purpose: Trigger file change hooks defined in codebuff.json for the specified files. This tool allows the backend to request the client to run its configured file change hooks (like tests, linting, type checking) after file changes have been applied.

Use cases:
- After making code changes, trigger the relevant tests and checks
- Ensure code quality by running configured linters and type checkers
- Validate that changes don't break the build

The client will run only the hooks whose filePattern matches the provided files.

Example:
${getToolCallString(toolName, {
  files: ['src/components/Button.tsx', 'src/utils/helpers.ts'],
})}
    `.trim(),
} satisfies ToolDescription
