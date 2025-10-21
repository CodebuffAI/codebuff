import { getToolCallString } from '@codebuff/common/tools/utils'

import type { ToolDescription } from '../tool-def-type'

const toolName = 'str_replace'
export const strReplaceTool = {
  toolName,
  description: `
Use this tool to make edits within existing files. Prefer this tool over the write_file tool for existing files, unless you need to make major changes throughout the file, in which case use write_file.

Important:
If you are making multiple edits in a row to a file, use only one str_replace call with multiple replacements instead of multiple str_replace tool calls.

Example:
${getToolCallString(toolName, {
  path: 'path/to/file',
  replacements: [
    { old: 'This is the old string', new: 'This is the new string' },
    {
      old: '\n\t\t// @codebuff delete this log line please\n\t\tconsole.log("Hello, world!");\n',
      new: '\n',
    },
    {
      old: '\nfoo:',
      new: '\nbar:',
      allowMultiple: true,
    },
  ],
})}
    `.trim(),
} satisfies ToolDescription
