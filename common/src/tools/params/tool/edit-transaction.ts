import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
  normalizeReplacementAliases,
  normalizeReplacementList,
  normalizeTransactionEditList,
} from '../utils'
import { basedOnReadSchema, canonicalBasedOnReadSchema } from '../based-on-read'
import { fileMutationResultV1Schema } from '../../results/filesystem'
import { decodeReadCapabilityToken } from '../../../util/content-hash'
import {
  MAX_FILE_CHANGES_PER_TRANSACTION,
  MAX_TRANSACTION_INPUT_BYTES,
  MAX_TRANSACTION_UNIQUE_PATHS,
} from '../../../actions'

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
            'oldString is an explicit placeholder, not file content. Copy exact current text from read_files or use a replace_range edit with a fresh readCapability.',
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
    readCapability: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Preferred target anchor copied verbatim from a fresh read_files range header. It supplies the range bounds and expected hash together.',
      ),
    startLine: z.number().int().min(1).optional(),
    endLine: z.number().int().min(1).optional(),
    expectedHash: z.string().min(1).optional(),
    newContent: z.string().refine((value) => !isObviousEditPlaceholder(value), {
      message:
        'newContent is an explicit placeholder; provide the complete range replacement.',
    }),
  })
  .superRefine((edit, ctx) => {
    const explicitTarget = [edit.startLine, edit.endLine, edit.expectedHash]
    const hasAnyExplicitTarget = explicitTarget.some(
      (value) => value !== undefined,
    )
    const hasCompleteExplicitTarget = explicitTarget.every(
      (value) => value !== undefined,
    )
    if (!edit.readCapability) {
      if (hasAnyExplicitTarget && !hasCompleteExplicitTarget) {
        ctx.addIssue({
          code: 'custom',
          message:
            'Provide startLine, endLine, and expectedHash together, or provide only readCapability.',
        })
        return
      }
      if (!hasCompleteExplicitTarget) {
        ctx.addIssue({
          code: 'custom',
          message:
            'replace_range requires either readCapability or the complete startLine/endLine/expectedHash tuple from one fresh range read.',
        })
        return
      }
      if (
        edit.startLine !== undefined &&
        edit.endLine !== undefined &&
        edit.startLine > edit.endLine
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'startLine must be <= endLine',
        })
      }
      return
    }
    // readCapability is present. Decode once to decide whether it may be
    // combined with explicit targets.
    const decoded = decodeReadCapabilityToken(edit.readCapability)
    if (typeof decoded === 'string') {
      ctx.addIssue({
        code: 'custom',
        path: ['readCapability'],
        message: decoded,
      })
      return
    }
    // expectedHash is never accepted alongside a capability: its hash attests
    // the capability's own bounds, not the caller's sub-range. Surface the
    // capability bounds in the message so callers can correlate the rejection
    // with the specific capability they supplied.
    if (edit.expectedHash !== undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['readCapability'],
        message: `Use one range target form only: provide readCapability by itself, or provide startLine/endLine/expectedHash without readCapability. The capability covers lines ${decoded.startLine}-${decoded.endLine}; do not also pass expectedHash — the runtime derives the hash from the capability.`,
      })
      return
    }
    const capabilityIsStrictSubRange = decoded.startLine !== 1
    const hasCallerBounds =
      edit.startLine !== undefined && edit.endLine !== undefined
    // A whole-file capability (startLine === 1) may be combined with narrower
    // caller-selected startLine/endLine (but NOT expectedHash); a strict
    // sub-range capability combined with a different target is rejected.
    if (capabilityIsStrictSubRange && hasAnyExplicitTarget) {
      if (
        hasCallerBounds &&
        (decoded.startLine !== edit.startLine ||
          decoded.endLine !== edit.endLine)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['readCapability'],
          message: `readCapability covers lines ${decoded.startLine}-${decoded.endLine} which is a strict sub-range; it cannot be combined with a different startLine/endLine. Pass a whole-file capability (lines 1-N) to target a narrower sub-range.`,
        })
      } else {
        ctx.addIssue({
          code: 'custom',
          path: ['readCapability'],
          message: `Use one range target form only: provide readCapability by itself, or provide startLine/endLine/expectedHash without readCapability. The capability covers lines ${decoded.startLine}-${decoded.endLine}.`,
        })
      }
      return
    }
    // Partial explicit target (only one of startLine/endLine) alongside a
    // capability is ambiguous and rejected.
    if ((edit.startLine !== undefined) !== (edit.endLine !== undefined)) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Provide startLine and endLine together when selecting a sub-range with readCapability, or omit both.',
      })
    }
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

const canonicalReplacementSchema = z.object({
  oldString: z.string().min(1),
  newString: z.string(),
  allowMultiple: z.boolean().optional().default(false),
  occurrenceIndex: z.number().int().min(1).optional(),
  basedOnRead: canonicalBasedOnReadSchema,
  skipIfMissing: z.boolean().optional(),
})
const canonicalStrReplaceEditSchema = editBaseSchema.extend({
  type: z.literal('str_replace'),
  replacements: z.array(canonicalReplacementSchema).min(1),
})
const canonicalReplaceRangeEditSchema = editBaseSchema.extend({
  type: z.literal('replace_range'),
  readCapability: z.string().min(1),
  newContent: z.string(),
})
const providerTransactionEditSchema = z.discriminatedUnion('type', [
  canonicalStrReplaceEditSchema,
  structuredEditSchema,
  createFileEditSchema,
  deleteFileEditSchema,
  moveFileEditSchema,
  canonicalReplaceRangeEditSchema,
  rewriteSymbolEditSchema,
  patchEditSchema,
  writeFileEditSchema,
])

export const boundedTransactionEditListSchema = z
  .array(transactionEditSchema)
  .min(1, 'Transaction edits cannot be empty')
  .max(
    MAX_FILE_CHANGES_PER_TRANSACTION,
    `A transaction can contain at most ${MAX_FILE_CHANGES_PER_TRANSACTION} edits. Split larger changes into bounded transactions.`,
  )
  .superRefine((edits, ctx) => {
    const paths = new Set(
      edits.flatMap((edit) =>
        edit.type === 'move' ? [edit.path, edit.destinationPath] : [edit.path],
      ),
    )
    if (paths.size > MAX_TRANSACTION_UNIQUE_PATHS) {
      ctx.addIssue({
        code: 'custom',
        message: `A transaction can touch at most ${MAX_TRANSACTION_UNIQUE_PATHS} unique paths. Split larger changes into bounded transactions.`,
      })
    }
    const inputBytes = new TextEncoder().encode(
      JSON.stringify(edits),
    ).byteLength
    if (inputBytes > MAX_TRANSACTION_INPUT_BYTES) {
      ctx.addIssue({
        code: 'custom',
        message: `Transaction input exceeds the ${MAX_TRANSACTION_INPUT_BYTES}-byte limit. Split larger changes into bounded transactions.`,
      })
    }
  })

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
        boundedTransactionEditListSchema,
      )
      .transform((edits) =>
        edits.map((edit) => {
          if (edit.type !== 'replace_range') return edit
          if (edit.readCapability) {
            const decoded = decodeReadCapabilityToken(edit.readCapability)
            if (typeof decoded === 'string') {
              throw new Error(decoded)
            }
            // When the caller supplied their own startLine/endLine alongside
            // a whole-file capability, KEEP the caller's bounds and leave
            // expectedHash undefined so the runtime preflight verifies the
            // whole-file hash against current content and accepts the
            // requested sub-range. Carry decoded.hash as wholeFileCapabilityHash.
            const callerSuppliedBounds =
              edit.startLine !== undefined && edit.endLine !== undefined
            const callerBoundsEqualCapability =
              callerSuppliedBounds &&
              edit.startLine === decoded.startLine &&
              edit.endLine === decoded.endLine
            if (callerSuppliedBounds && !callerBoundsEqualCapability) {
              return {
                ...edit,
                startLine: edit.startLine!,
                endLine: edit.endLine!,
                expectedHash: undefined,
                wholeFileCapabilityHash: decoded.hash,
              }
            }
            return {
              ...edit,
              startLine: decoded.startLine,
              endLine: decoded.endLine,
              expectedHash: decoded.hash,
              wholeFileCapabilityHash: undefined,
            }
          }
          return {
            ...edit,
            startLine: edit.startLine!,
            endLine: edit.endLine!,
            expectedHash: edit.expectedHash!,
            wholeFileCapabilityHash: undefined,
          }
        }),
      )
      .describe(
        'All edits that must preflight together. Pass an actual array of edit objects; do not JSON.stringify the array or its entries. The runtime defensively decodes complete legacy JSON encodings, but malformed or truncated strings fail closed. An omitted type is inferred only when the payload shape identifies one unambiguous operation, such as replacements implying str_replace. If any edit fails during preflight, no files are changed.',
      ),
  })
  .describe(
    'Preflight related edits together, then apply them in one coordinated client-side transaction with deterministic order and explicit rollback outcomes.',
  )
const providerInputSchema = z.object({
  edits: z
    .array(providerTransactionEditSchema)
    .min(1)
    .max(MAX_FILE_CHANGES_PER_TRANSACTION),
})

const description = `
Use this tool when related edits across one or more files should be preflighted together before applying, such as updating a utility and its tests together.

Important:
- Pass edits as a real JSON array of objects. Never JSON.stringify the edits array or individual entries. Complete legacy encodings may be repaired, but truncated serialized payloads cannot be recovered safely.
- Never use prose placeholders such as "[see patch above]" in any edit. Each oldString must contain exact current file content and each newString/content/diff field must contain the complete intended bytes. Placeholder calls are rejected before they can consume a valid read authorization.
- The transaction preflights every edit against in-memory file contents first.
- If ANY edit fails during preflight, NO files are changed.
- Every per-file edit is atomic during preflight, including small files.
- Structured edits are dispatched deterministically by operation kind; supported operations include insert_text, insert_import, and remove_import.
- Select an edit type per operation: str_replace, replace_range, rewrite_symbol, patch, structured, create, delete, move, or write_file.
- For replace_range edits, prefer the single readCapability copied from a fresh read_files range header; the transaction normalizes it to verified line bounds and hash during validation.
- Use insert_import/remove_import for TypeScript import-only changes; use the str_replace edit type for larger semantic changes.
- Large-file str_replace edits use deterministic exact-match semantics: unique oldString edits can apply without basedOnRead; ambiguous targets should use basedOnRead from fresh read_files.ranges output.
- Patches are applied as one coordinated client-side transaction after preflight. Commit failures trigger best-effort rollback and report rolled-back or rollback-incomplete outcomes; do not assume external filesystem atomicity.
- A transaction may contain one simple one-file edit or a coordinated multi-file change; this is the canonical model-facing mutation surface.

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
  providerInputSchema,
  outputSchema: jsonToolResultSchema(editTransactionResultSchema),
} satisfies $ToolParams
