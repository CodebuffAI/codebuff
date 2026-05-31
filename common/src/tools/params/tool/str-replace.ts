import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
  normalizeReplacementAliases,
} from '../utils'

import type { $ToolParams } from '../../constants'

export const updateFileResultSchema = z.union([
  z.object({
    file: z.string(),
    message: z.string(),
  }),
  z.object({
    file: z.string(),
    errorMessage: z.string(),
    patch: z.string().optional(),
  }),
])

const toolName = 'str_replace'
const endsAgentStep = false
const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe(`The path to the file to edit.`),
    replacements: z
      .preprocess(
        coerceToArray,
        z
          .array(
            z
              .preprocess(
                normalizeReplacementAliases,
                z.object({
                  oldString: z
                    .string()
                    .min(1, 'oldString cannot be empty')
                    .describe(
                      `The string to replace. This must be an *exact match* of the string you want to replace, including whitespace and punctuation.`,
                    ),
                  newString: z
                    .string()
                    .describe(
                      `The string to replace the corresponding oldString with. Can be empty to delete.`,
                    ),
                  allowMultiple: z
                    .boolean()
                    .optional()
                    .default(false)
                    .describe(
                      'Whether to allow multiple replacements of oldString.',
                    ),
                  basedOnRead: z
                    .union([
                      z
                        .string()
                        .min(1)
                        .describe(
                          'The single readCapability token copied verbatim from a fresh read_files range header (e.g. "cap.ABC123"). Preferred: one value to copy instead of three.',
                        ),
                      z.object({
                        startLine: z
                          .number()
                          .int()
                          .min(1)
                          .describe(
                            '1-indexed inclusive start line from the read_files.ranges result this replacement is based on.',
                          ),
                        endLine: z
                          .number()
                          .int()
                          .min(1)
                          .describe(
                            '1-indexed inclusive end line from the read_files.ranges result this replacement is based on.',
                          ),
                        hash: z
                          .string()
                          .min(1)
                          .describe(
                            'The sha256 rangeHash returned by read_files.ranges for this exact range.',
                          ),
                      }),
                    ])
                    .optional()
                    .describe(
                      'Required for large-file edits. Either the readCapability token from a fresh read_files range header (preferred), or { startLine, endLine, hash } copied from that header. The runtime rejects stale/invalid anchors before applying.',
                    ),
                }),
              )
              .refine(
                (replacement) =>
                  !replacement.basedOnRead ||
                  typeof replacement.basedOnRead === 'string' ||
                  replacement.basedOnRead.startLine <= replacement.basedOnRead.endLine,
                {
                  message: 'basedOnRead.startLine must be <= basedOnRead.endLine',
                },
              )
              .describe('Pair of oldString and newString values.'),
          )
          .min(1, 'Replacements cannot be empty'),
      )
      .describe('Array of replacements to make.'),
  })
  .describe(`Replace strings in a file with new strings.`)
const description = `
Use this tool to make edits within existing files.

Important:
If you are making multiple edits in a row to a file, use only one str_replace call with multiple replacements instead of multiple str_replace tool calls.
For large files, first use read_files with ranges to read the exact line window you intend to edit. Large-file replacements require basedOnRead: copy the single readCapability token from the read_files range header (preferred), or the { startLine, endLine, hash } values from that header. Naked str_replace is rejected before editing large files.
If a replacement fails, re-read the closest candidate range reported in the error before retrying.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'path/to/file',
    replacements: [
      {
        oldString: 'This is the old string',
        newString: 'This is the new string',
      },
      {
        oldString: 'const current = 1',
        newString: 'const current = 2',
        basedOnRead: 'cap.MTIwOjEyMDpzaGEyNTY6YWJjMTIz',
      },
      {
        oldString:
          '\n\t\t// @codebuff delete this log line please\n\t\tconsole.log("Hello, world!");\n',
        newString: '\n',
      },
      {
        oldString: '\nfoo:',
        newString: '\nbar:',
        allowMultiple: true,
      },
    ],
  },
  endsAgentStep,
})}
    `.trim()

export const strReplaceParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
