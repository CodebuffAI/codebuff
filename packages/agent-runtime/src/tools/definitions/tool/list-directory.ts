import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'list_directory'
export const listDirectoryTool = {
  toolName,
  description: `
Lists all files and directories in the specified path. Useful for exploring directory structure and finding files.

Example:
${getToolCallString(toolName, {
  path: 'src/components',
})}

${getToolCallString(toolName, {
  path: '.',
})}
    `.trim(),
} satisfies ToolDescription
