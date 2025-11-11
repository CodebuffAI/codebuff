import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'read_subtree'
export const readSubtreeTool = {
  toolName,
  description: `
Example:
${getToolCallString(toolName, {
  paths: ['src', 'package.json'],
  maxTokens: 4000,
})}

Purpose: Read a directory subtree and return a blob containing subdirectories, file names, and parsed variable/functions names from source files. For files, return only the parsed variable names. If no paths are provided, returns the entire project tree. The output is truncated to fit within the provided token budget.

- Use this tool on particular subdirectories when you need to know all the nested files and directories. E.g. for a refactoring task, or to understand a particular part of the codebase.
- In normal use, don't set maxTokens beyond 10,000.
    `.trim(),
} satisfies ToolDescription
