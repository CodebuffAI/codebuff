import z from 'zod/v4'

/**
 * Shared `basedOnRead` capability schema.
 *
 * Used by `str_replace`, `write_file`, `propose_str_replace`, and
 * `edit_transaction` to satisfy strict read-before-edit without a prior
 * `read_files` call in the same turn, and by `apply_patch` to anchor each
 * touched hunk to a fresh read range.
 *
 * Two accepted shapes:
 * - A `readCapability` token string copied verbatim from a fresh
 *   `read_files.ranges` header.
 * - An object with the range's `startLine`, `endLine`, and `sha256 rangeHash`.
 *
 * Semantics:
 * - Presence bypasses the strict read-before-edit gate for the target path.
 * - Verification is tool-specific. Large-file `str_replace` and
 *   `apply_patch` validate the supplied range hash against current content;
 *   small-file `str_replace` normally relies on exact oldString matching. In
 *   strict read-before-edit mode, supplied anchors are validated regardless of
 *   file size. Range capabilities do not authorize whole-file overwrites.
 * - For anchored `str_replace`/`propose_str_replace`/`edit_transaction`, a
 *   fresh anchor constrains matching to that range and clears stale failed-edit
 *   state. For `apply_patch`, one fresh anchor per touched hunk lets the
 *   runtime reject stale or out-of-range hunks before editing.
 */

/** Object-form read capability (startLine/endLine/hash) shared by all callers. */
export const basedOnReadRangeSchema = z
  .object({
    startLine: z
      .number()
      .int()
      .min(1)
      .describe(
        '1-indexed inclusive start line from the read_files.ranges result this anchor covers.',
      ),
    endLine: z
      .number()
      .int()
      .min(1)
      .describe(
        '1-indexed inclusive end line from the read_files.ranges result this anchor covers.',
      ),
    hash: z
      .string()
      .min(1)
      .describe(
        'The sha256 rangeHash returned by read_files.ranges for this exact range.',
      ),
  })
  .refine((val) => val.startLine <= val.endLine, {
    message: 'basedOnRead.startLine must be <= basedOnRead.endLine',
  })

/**
 * Token-string OR object union accepted by str_replace/write_file/
 * propose_str_replace/edit_transaction. Presence bypasses strict
 * read-before-edit for the target path.
 */
export const basedOnReadSchema = z
  .union([
    z
      .string()
      .min(1)
      .describe(
        'The single readCapability token copied verbatim from a fresh read_files range header (e.g. "cap.ABC123"). Preferred: one value to copy instead of three.',
      ),
    basedOnReadRangeSchema,
  ])
  .optional()
  .describe(
    'Optional range anchor from a fresh read_files call. Accepts either the readCapability token copied verbatim from a fresh read_files range header (preferred; one value to copy instead of three), or the explicit { startLine, endLine, hash } object from that header. Large-file str_replace and apply_patch validate the hash against current content; strict read-before-edit validates supplied str_replace anchors regardless of file size. Range capabilities do not authorize whole-file write_file overwrites. Only copy capabilities from a fresh read.',
  )
