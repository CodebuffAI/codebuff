import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'read_files'
export const readFilesTool = {
  toolName,
  description: `
Note: DO NOT call this tool for files you've already read! There's no need to read them again — any changes to the files will be surfaced to you as a file update tool result.

Example:
${getToolCallString(toolName, {
  paths: ['path/to/file1.ts', 'path/to/file2.ts'],
})}
    `.trim(),
} satisfies ToolDescription
