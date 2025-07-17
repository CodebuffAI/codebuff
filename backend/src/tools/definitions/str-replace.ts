import { getToolCallString } from '@codebuff/common/constants/tools'
import { closeXml } from '@codebuff/common/util/xml'
import z from 'zod/v4'
import { CodebuffToolDef } from '../constants'

const toolName = 'str_replace'
const endsAgentStep = false
export const strReplaceTool = {
  toolName,
  endsAgentStep,
  parameters: z
    .object({
      path: z
        .string()
        .min(1, 'Path cannot be empty')
        .describe(`The path to the file to edit.`),
      replacements: z
        .array(
          z
            .object({
              old: z
                .string()
                .min(1, 'Old cannot be empty')
                .describe(
                  `The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation.`
                ),
              new: z
                .string()
                .describe(
                  `The string to replace the corresponding old string with. Can be empty to delete.`
                ),
            })
            .describe('Pair of old and new strings.')
        )
        .min(1, 'Replacements cannot be empty')
        .describe('Array of replacements to make.'),
    })
    .describe(`Replace strings in a file with new strings.`),
  description: `
Use this tool to make edits within existing files. Prefer this tool over the write_file tool for existing files, unless you need to make major changes throughout the file, in which case use write_file.

Important:
If you are making multiple edits in a row to a file, use only one <str_replace> call with multiple replacements instead of multiple str_replace tool calls.

Don't forget to close the <str_replace> tag with ${closeXml('str_replace')} after you have finished making all the replacements.

Example:
${getToolCallString(
  toolName,
  {
    path: 'path/to/file',
    replacements: [
      { old: 'This is the old string', new: 'This is the new string' },
      { old: 'line to delete\n', new: '' },
    ],
  },
  endsAgentStep
)}
    `.trim(),
} satisfies CodebuffToolDef
