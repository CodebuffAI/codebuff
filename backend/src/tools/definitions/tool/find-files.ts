import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'

const toolName = 'find_files'
export const findFilesTool = {
  toolName,
  description: `
Example:
${getToolCallString(toolName, {
  description: 'The implementation of function foo',
})}

Purpose: Better fulfill the user request by reading files which could contain information relevant to the user's request.
Use cases:
- If you are calling a function or creating a class and want to know how it works, use this tool to get the implementation.
- If you need to understand a section of the codebase, read more files in that directory or subdirectories.
- Some requests require a broad understanding of multiple parts of the codebase. Consider using find_files to gain more context before making changes.

Don't use this tool if:
- You already know the exact path of the file(s) you are looking for — in this case, use read_files.
- You already read the files you need in context.
- You know the name of the file you need. Instead use run_terminal_command with \`find -name\` (or \`dir /s /b\` or \`Get-ChildItem -Recurse -Filter\`)

This tool is not guaranteed to find the correct file. In general, prefer using read_files instead of find_files.
      `.trim(),
} satisfies ToolDescription
