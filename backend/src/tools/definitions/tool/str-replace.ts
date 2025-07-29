import type { ToolDescription } from '../tool-def-type'

import { getToolCallString } from '@codebuff/common/tools/utils'
import { closeXml } from '@codebuff/common/util/xml'

const toolName = 'str_replace'
const endsAgentStep = false
export const strReplaceTool = {
  toolName,
  description: `
Use this tool to make edits within existing files. Prefer this tool over the write_file tool for existing files, unless you need to make major changes throughout the file, in which case use write_file.

Important:
If you are making multiple edits in a row to a file, use only one <str_replace> call with multiple replacements instead of multiple str_replace tool calls.

Don't forget to close the <str_replace> tag with ${closeXml('str_replace')} after you have finished making all the replacements.

Example:
${getToolCallString(toolName, {
  path: 'path/to/file',
  replacements: [
    { old: 'This is the old string', new: 'This is the new string' },
    { old: 'line to delete\n', new: '' },
  ],
})}
    `.trim(),
} satisfies ToolDescription
