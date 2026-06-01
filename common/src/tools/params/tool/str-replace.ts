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
    atomic: z
      .boolean()
      .optional()
      .default(false)
      .describe(
        'Whether to make the replacement batch all-or-nothing. If true, any failed replacement aborts the entire batch with no changes. Large-file edits are always atomic regardless of this setting.',
      ),
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
                      'Optional range anchor from read_files.ranges. If fresh, it constrains matching to that range; if missing or stale on a large file, the runtime falls back to full-file deterministic oldString matching when it can identify exactly one safe target.',
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
Use atomic: true when replacements are one logical change and should be all-or-nothing; any failed replacement will abort the batch with no changes. Omit atomic (or set false) when independent small-file replacements may partially succeed. Large-file edits are always atomic.
For large files, str_replace still applies against the full current file atomically. If oldString is unique, a naked str_replace can apply safely without basedOnRead. Use basedOnRead from read_files.ranges when oldString is ambiguous or you want to constrain the edit to a specific range; stale anchors fall back to deterministic full-file matching when possible.
If a replacement fails, re-read the closest candidate range reported in the error before retrying.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'path/to/file',
    atomic: true,
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
