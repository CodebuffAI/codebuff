import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
  normalizeReplacementAliases,
} from '../utils'

import { updateFileResultSchema } from './str-replace'

import type { $ToolParams } from '../../constants'

const replacementSchema = z
  .preprocess(
    normalizeReplacementAliases,
    z.object({
      oldString: z
        .string()
        .min(1, 'oldString cannot be empty')
        .describe(
          'The string to replace. This must match the current file content exactly unless the deterministic near-match guard can prove one safe target.',
        ),
      newString: z
        .string()
        .describe('The string to replace the corresponding oldString with. Can be empty to delete.'),
      allowMultiple: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to allow multiple replacements of oldString.'),
      basedOnRead: z
        .union([
          z
            .string()
            .min(1)
            .describe(
              'The single readCapability token copied verbatim from a fresh read_files range header (e.g. "cap.ABC123"). Optional; useful to constrain ambiguous large-file edits to a specific range.',
            ),
          z.object({
            startLine: z.number().int().min(1),
            endLine: z.number().int().min(1),
            hash: z.string().min(1),
          }),
        ])
        .optional()
        .describe(
          'Optional range anchor from read_files.ranges. If fresh, it constrains matching to that range; if missing or stale on a large file, transaction preflight falls back to deterministic full-file oldString matching when it can identify exactly one safe target.',
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

const editBaseSchema = z.object({
  id: z
    .string()
    .min(1)
    .optional()
    .describe('Optional stable edit identifier echoed in diagnostics.'),
  path: z.string().min(1, 'Path cannot be empty').describe('The file to edit.'),
})

const strReplaceEditSchema = editBaseSchema.extend({
  type: z.literal('str_replace').describe('The edit operation type.'),
  replacements: z
    .preprocess(
      coerceToArray,
      z.array(replacementSchema).min(1, 'Replacements cannot be empty'),
    )
    .describe('String replacements to apply to this file.'),
})

const insertTextOperationSchema = z.object({
  kind: z.literal('insert_text').describe('Deterministic text insertion.'),
  position: z
    .object({
      line: z.number().int().min(1).describe('1-indexed target line.'),
      column: z.number().int().min(1).describe('1-indexed target column.'),
    })
    .describe('1-indexed insertion position.'),
  text: z.string().min(1, 'Inserted text cannot be empty'),
})

const insertImportOperationSchema = z.object({
  kind: z.literal('insert_import').describe('TypeScript-aware import insertion.'),
  importStatement: z
    .string()
    .min(1, 'importStatement cannot be empty')
    .describe('Complete TypeScript import statement to add, e.g. "import { foo } from \'bar\'".'),
})

const removeImportOperationSchema = z
  .object({
    kind: z.literal('remove_import').describe('TypeScript-aware import removal.'),
    importStatement: z
      .string()
      .min(1, 'importStatement cannot be empty')
      .optional()
      .describe('Complete TypeScript import statement to remove. Required unless moduleSpecifier is provided.'),
    moduleSpecifier: z
      .string()
      .min(1, 'moduleSpecifier cannot be empty')
      .optional()
      .describe('Module specifier to remove imports from, e.g. "react" or "./helper".'),
  })
  .refine(
    (operation) => operation.importStatement || operation.moduleSpecifier,
    {
      message: 'remove_import requires importStatement or moduleSpecifier',
    },
  )

const structuredEditSchema = editBaseSchema.extend({
  type: z.literal('structured').describe('A structured edit dispatched by operation kind.'),
  operation: z
    .discriminatedUnion('kind', [
      insertTextOperationSchema,
      insertImportOperationSchema,
      removeImportOperationSchema,
    ])
    .describe('Structured edit operation to apply to this file.'),
})

export const transactionEditSchema = z.discriminatedUnion('type', [
  strReplaceEditSchema,
  structuredEditSchema,
])

export const editTransactionResultSchema = z.union([
  updateFileResultSchema,
  z.object({
    message: z.string(),
    files: z.array(
      z.object({
        path: z.string(),
        patch: z.string(),
        messages: z.array(z.string()),
      }),
    ),
  }),
  z.object({
    errorMessage: z.string(),
    failures: z.array(
      z.object({
        editIndex: z.number().int().min(-1),
        id: z.string().optional(),
        path: z.string(),
        errorMessage: z.string(),
      }),
    ),
  }),
])

const toolName = 'edit_transaction'
const endsAgentStep = false
const inputSchema = z
  .object({
    edits: z
      .array(transactionEditSchema)
      .min(1, 'Transaction edits cannot be empty')
      .describe('All edits that must preflight together. If any edit fails during preflight, no files are changed.'),
  })
  .describe('Preflight related edits across one or more files as an atomic transaction, then apply the prepared file patches as one client-side batch.')

const description = `
Use this tool when related edits across one or more files should be preflighted together before applying, such as updating a utility and its tests together.

Important:
- The transaction preflights every edit against in-memory file contents first.
- If ANY edit fails during preflight, NO files are changed.
- Every per-file edit is atomic during preflight, including small files.
- Structured edits are dispatched deterministically by operation kind; supported operations include insert_text, insert_import, and remove_import.
- Use insert_import/remove_import for TypeScript import-only changes; use str_replace for larger semantic changes.
- Large-file str_replace edits use the same deterministic semantics as str_replace: unique oldString edits can apply without basedOnRead; ambiguous targets should use basedOnRead from fresh read_files.ranges output.
- Patches are applied as one client-side atomic batch after the whole transaction preflights; if the client rejects the batch, stop and re-read all affected files before retrying.
- Use str_replace directly for simple one-file edits; use edit_transaction when cross-file consistency matters.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    edits: [
      {
        id: 'update-helper',
        type: 'str_replace',
        path: 'src/helper.ts',
        replacements: [
          {
            oldString: 'export const value = 1',
            newString: 'export const value = 2',
          },
        ],
      },
      {
        id: 'update-helper-test',
        type: 'str_replace',
        path: 'src/helper.test.ts',
        replacements: [
          {
            oldString: 'expect(value).toBe(1)',
            newString: 'expect(value).toBe(2)',
          },
        ],
      },
    ],
  },
  endsAgentStep,
})}
`.trim()

export const editTransactionParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(editTransactionResultSchema),
} satisfies $ToolParams
