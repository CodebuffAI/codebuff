import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
  normalizeReplacementAliases,
  normalizeReplacementList,
  normalizeTransactionEditList,
} from '../utils'
import { basedOnReadSchema } from '../based-on-read'
import { fileMutationResultV1Schema } from '../../results/filesystem'

import { updateFileResultSchema } from './str-replace'

import type { $ToolParams } from '../../constants'

const replacementSchema = z.preprocess(
  normalizeReplacementAliases,
  z
    .object({
      oldString: z
        .string()
        .min(1, 'oldString cannot be empty')
        .describe(
          'The string to replace. This must match the current file content exactly unless the deterministic near-match guard can prove one safe target.',
        ),
      newString: z
        .string()
        .describe(
          'The string to replace the corresponding oldString with. Can be empty to delete.',
        ),
      allowMultiple: z
        .boolean()
        .optional()
        .default(false)
        .describe('Whether to allow multiple replacements of oldString.'),
      occurrenceIndex: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          'Optional 1-indexed exact occurrence to replace when oldString appears multiple times. Matches str_replace occurrenceIndex semantics and may be combined with basedOnRead to count only within an anchored range.',
        ),
      basedOnRead: basedOnReadSchema,
      skipIfMissing: z
        .boolean()
        .optional()
        .describe(
          'For deletion replacements only (newString is empty): treat a missing oldString as an already-applied no-op. Use only for explicit idempotent cleanup retries, never for ordinary edits.',
        ),
    })
    .superRefine((replacement, ctx) => {
      if (isObviousEditPlaceholder(replacement.oldString)) {
        ctx.addIssue({
          code: 'custom',
          path: ['oldString'],
          message:
            'oldString is an explicit placeholder, not file content. Copy exact current text from read_files or use replace_range with a fresh expectedHash.',
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
      if (replacement.skipIfMissing && replacement.newString !== '') {
        ctx.addIssue({
          code: 'custom',
          path: ['skipIfMissing'],
          message:
            'skipIfMissing is only valid for deletion replacements with an empty newString.',
        })
      }
    }),
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
      normalizeReplacementList,
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
  kind: z.literal('insert_import').describe('Language-aware import insertion.'),
  importStatement: z
    .string()
    .min(1, 'importStatement cannot be empty')
    .describe(
      'Complete language-native import statement to add, e.g. "import { foo } from \'bar\'", "from app import value", or "use crate::value".',
    ),
})

const removeImportOperationSchema = z
  .object({
    kind: z.literal('remove_import').describe('Language-aware import removal.'),
    importStatement: z
      .string()
      .min(1, 'importStatement cannot be empty')
      .optional()
      .describe(
        'Complete language-native import statement to remove. Required unless moduleSpecifier is provided.',
      ),
    moduleSpecifier: z
      .string()
      .min(1, 'moduleSpecifier cannot be empty')
      .optional()
      .describe(
        'Module specifier to remove imports from, e.g. "react" or "./helper".',
      ),
  })
  .refine(
    (operation) => operation.importStatement || operation.moduleSpecifier,
    {
      message: 'remove_import requires importStatement or moduleSpecifier',
    },
  )

const structuredEditSchema = editBaseSchema.extend({
  type: z
    .literal('structured')
    .describe('A structured edit dispatched by operation kind.'),
  operation: z
    .discriminatedUnion('kind', [
      insertTextOperationSchema,
      insertImportOperationSchema,
      removeImportOperationSchema,
    ])
    .describe('Structured edit operation to apply to this file.'),
})

const createFileEditSchema = editBaseSchema.extend({
  type: z.literal('create'),
  content: z
    .string()
    .refine((value) => !isObviousEditPlaceholder(value), {
      message: 'content is an explicit placeholder; provide exact file bytes.',
    })
    .describe('Exact bytes to write to the new file.'),
})

const deleteFileEditSchema = editBaseSchema.extend({
  type: z.literal('delete'),
})

const moveFileEditSchema = editBaseSchema.extend({
  type: z.literal('move'),
  destinationPath: z
    .string()
    .min(1, 'destinationPath cannot be empty')
    .describe('New project-relative path. The destination must be absent.'),
})

const replaceRangeEditSchema = editBaseSchema
  .extend({
    type: z.literal('replace_range'),
    startLine: z.number().int().min(1),
    endLine: z.number().int().min(1),
    expectedHash: z.string().min(1),
    newContent: z.string().refine((value) => !isObviousEditPlaceholder(value), {
      message:
        'newContent is an explicit placeholder; provide the complete range replacement.',
    }),
  })
  .refine((edit) => edit.startLine <= edit.endLine, {
    message: 'startLine must be <= endLine',
  })

const rewriteSymbolEditSchema = editBaseSchema.extend({
  type: z.literal('rewrite_symbol'),
  symbol: z.string().min(1),
  content: z.string().refine((value) => !isObviousEditPlaceholder(value), {
    message:
      'content is an explicit placeholder; provide the complete symbol source.',
  }),
  occurrence: z.number().int().positive().optional(),
})

const patchEditSchema = editBaseSchema.extend({
  type: z.literal('patch'),
  diff: z
    .string()
    .min(1)
    .refine((value) => !isObviousEditPlaceholder(value), {
      message: 'diff is an explicit placeholder; provide the complete patch.',
    }),
})

const writeFileEditSchema = editBaseSchema.extend({
  type: z.literal('write_file'),
  content: z.string().refine((value) => !isObviousEditPlaceholder(value), {
    message: 'content is an explicit placeholder; provide exact file bytes.',
  }),
})

export const transactionEditSchema = z.discriminatedUnion('type', [
  strReplaceEditSchema,
  structuredEditSchema,
  createFileEditSchema,
  deleteFileEditSchema,
  moveFileEditSchema,
  replaceRangeEditSchema,
  rewriteSymbolEditSchema,
  patchEditSchema,
  writeFileEditSchema,
])

export const editTransactionResultSchema = z.union([
  fileMutationResultV1Schema,
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
      .preprocess(
        normalizeTransactionEditList,
        z
          .array(transactionEditSchema)
          .min(1, 'Transaction edits cannot be empty'),
      )
      .describe(
        'All edits that must preflight together. A JSON-stringified edit array is accepted and decoded before validation. An omitted type is inferred only when the payload shape identifies one unambiguous operation, such as replacements implying str_replace. If any edit fails during preflight, no files are changed.',
      ),
  })
  .describe(
    'Preflight related edits together, then apply them in one coordinated client-side transaction with deterministic order and explicit rollback outcomes.',
  )

const description = `
Use this tool when related edits across one or more files should be preflighted together before applying, such as updating a utility and its tests together.

Important:
- Never use prose placeholders such as "[see patch above]" in any edit. Each oldString must contain exact current file content and each newString/content/diff field must contain the complete intended bytes. Placeholder calls are rejected before they can consume a valid read authorization.
- The transaction preflights every edit against in-memory file contents first.
- If ANY edit fails during preflight, NO files are changed.
- Every per-file edit is atomic during preflight, including small files.
- Structured edits are dispatched deterministically by operation kind; supported operations include insert_text, insert_import, and remove_import.
- Transactions can also compose replace_range, rewrite_symbol, unified patch, and whole-file write_file operations with create/delete/move lifecycle actions.
- Use insert_import/remove_import for TypeScript import-only changes; use str_replace for larger semantic changes.
- Large-file str_replace edits use the same deterministic semantics as str_replace: unique oldString edits can apply without basedOnRead; ambiguous targets should use basedOnRead from fresh read_files.ranges output.
- Patches are applied as one coordinated client-side transaction after preflight. Commit failures trigger best-effort rollback and report rolled-back or rollback-incomplete outcomes; do not assume external filesystem atomicity.
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
