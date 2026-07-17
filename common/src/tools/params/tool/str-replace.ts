import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
  normalizeReplacementAliases,
  normalizeReplacementList,
} from '../utils'
import { basedOnReadSchema, canonicalBasedOnReadSchema } from '../based-on-read'
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
        normalizeReplacementList,
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
                        'When oldString appears multiple times, target exactly the Nth (1-indexed) occurrence. Requires an exact literal match (no near-match correction) and fails cleanly if fewer than N occurrences exist. Prefer combining it with a fresh basedOnRead range so occurrences are counted only inside a proven target window, never across unrelated file content.',
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
                    if (isObviousEditPlaceholder(replacement.oldString)) {
                      ctx.addIssue({
                        code: 'custom',
                        path: ['oldString'],
                        message:
                          'oldString is an explicit placeholder, not file content. Copy the exact current text from read_files or use replace_range with a fresh expectedHash.',
                      })
                    }
                    if (isObviousEditPlaceholder(replacement.newString)) {
                      ctx.addIssue({
                        code: 'custom',
                        path: ['newString'],
                        message:
                          'newString is an explicit placeholder, not replacement content. Provide the complete intended text.',
                      })
                    }
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
const providerInputSchema = z.object({
  path: z.string().min(1).describe('The file to edit.'),
  atomic: z.boolean().optional().default(false),
  replacements: z
    .array(
      z.object({
        oldString: z.string().min(1),
        newString: z.string(),
        allowMultiple: z.boolean().optional().default(false),
        occurrenceIndex: z.number().int().min(1).optional(),
        basedOnRead: canonicalBasedOnReadSchema,
        skipIfMissing: z.boolean().optional(),
      }),
    )
    .min(1),
})
const description = `
Use this tool to make edits within existing files.

Important:
Never send prose placeholders such as "[see patch above]" in oldString or newString. Tool calls do not share an out-of-band patch buffer: oldString must contain exact current file text and newString must contain the complete replacement.
If you are making multiple non-overlapping edits from the same current file snapshot, use one str_replace call with multiple replacements instead of multiple str_replace tool calls. Replacements apply sequentially: if one replacement changes text another oldString expects, consolidate them into one larger replacement or use replace_range/rewrite_symbol.
Use atomic: true when replacements are one logical change and should be all-or-nothing; any failed replacement will abort the batch with no changes. Omit atomic (or set false) when independent small-file replacements may partially succeed. Large-file edits are always atomic.
For large files, str_replace still applies against the full current file atomically. If oldString is unique, a naked str_replace can apply safely without basedOnRead. Use basedOnRead from read_files.ranges when oldString is ambiguous or you want to constrain the edit to a specific range. Once supplied, the anchor is an explicit scope and a stale anchor is rejected rather than ignored.
If an atomic batch fails, no replacements were applied. Re-read the closest candidate ranges reported in the error and rebuild the whole batch from that fresh snapshot; do not peel off remembered replacements into repeated smaller batches.
When oldString appears multiple times and you want to change exactly one of them, pass occurrenceIndex (1-indexed). Prefer a fresh basedOnRead range so the index is scoped to the proven window; a stale supplied range is rejected rather than silently counting across the whole file.
For Markdown/checklists or any block whose formatting may have changed, prefer read_files.ranges -> replace_range with the returned readCapability. This avoids reconstructing a large oldString from line-numbered/formatted output.
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
  providerInputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
