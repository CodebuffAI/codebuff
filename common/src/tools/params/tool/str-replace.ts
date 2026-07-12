import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
  normalizeReplacementAliases,
} from '../utils'
import { basedOnReadSchema } from '../based-on-read'
import { fileMutationResultV1Schema } from '../../results/filesystem'

import type { $ToolParams } from '../../constants'

export const updateFileResultSchema = z.union([
  fileMutationResultV1Schema,
  z.object({
    file: z.string(),
    message: z.string(),
  }),
  z.object({
    file: z.string(),
    errorMessage: z.string(),
    patch: z.string().optional(),
    errorCode: z.string().optional(),
    recovery: z
      .object({
        tool: z.literal('read_files'),
        input: z.object({ paths: z.array(z.string().min(1)).min(1) }),
      })
      .optional(),
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
                z
                  .object({
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
                    occurrenceIndex: z
                      .number()
                      .int()
                      .min(1)
                      .optional()
                      .describe(
                        'When oldString appears multiple times, target exactly the Nth (1-indexed) occurrence. Lets you disambiguate repeated text without a re-read or a longer oldString. Requires an exact literal match (no near-match correction) and fails cleanly if fewer than N occurrences exist. If a fresh basedOnRead range is also given, occurrences are counted within that range.',
                      ),
                    basedOnRead: basedOnReadSchema,
                    skipIfMissing: z
                      .boolean()
                      .optional()
                      .describe(
                        'For deletion replacements only: treat an already-missing oldString as a successful idempotent no-op.',
                      ),
                  })
                  .superRefine((replacement, ctx) => {
                    if (
                      replacement.skipIfMissing &&
                      replacement.newString !== ''
                    ) {
                      ctx.addIssue({
                        code: 'custom',
                        path: ['skipIfMissing'],
                        message:
                          'skipIfMissing is only valid for deletion replacements with an empty newString.',
                      })
                    }
                  }),
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
If you are making multiple non-overlapping edits from the same current file snapshot, use one str_replace call with multiple replacements instead of multiple str_replace tool calls. Replacements apply sequentially: if one replacement changes text another oldString expects, consolidate them into one larger replacement or use replace_range/rewrite_symbol.
Use atomic: true when replacements are one logical change and should be all-or-nothing; any failed replacement will abort the batch with no changes. Omit atomic (or set false) when independent small-file replacements may partially succeed. Large-file edits are always atomic.
For large files, str_replace still applies against the full current file atomically. If oldString is unique, a naked str_replace can apply safely without basedOnRead. Use basedOnRead from read_files.ranges when oldString is ambiguous or you want to constrain the edit to a specific range; stale anchors fall back to deterministic full-file matching when possible.
If an atomic batch fails, no replacements were applied. Re-read the closest candidate ranges reported in the error and rebuild the whole batch from that fresh snapshot; do not peel off remembered replacements into repeated smaller batches.
When oldString appears multiple times and you want to change exactly one of them, pass occurrenceIndex (1-indexed) to target the Nth occurrence directly, instead of lengthening oldString or re-reading. The ambiguity error lists every occurrence's line range to help you pick.
After a large-file edit, the success message returns a fresh basedOnRead readCapability for the edited region; pass it on your next edit to that region instead of re-reading.

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
      {
        oldString: 'obsolete();\n',
        newString: '',
        skipIfMissing: true,
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
