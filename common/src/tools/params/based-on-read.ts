import z from 'zod/v4'

/**
 * Shared `basedOnRead` capability schema.
 *
 * Used by `str_replace`, `write_file`, and `edit_transaction` to satisfy
 * strict read-before-edit without a prior
 * `read_files` call in the same turn, and by `apply_patch` to anchor each
 * touched hunk to a fresh read range.
 *
 * Two accepted shapes:
 * - A `readCapability` token string copied verbatim from a fresh
 *   `read_files.ranges` header.
 * - An object with the range's `startLine`, `endLine`, and `sha256 rangeHash`.
 *
 * Semantics:
 * - Only an authenticated cap.v3 token bound to the current project, path, and
 *   run can satisfy strict read-before-edit without a whole-file authorization.
 *   Legacy cap.v2/object forms remain freshness anchors only.
 * - Verification is tool-specific. Large-file `str_replace` and
 *   `apply_patch` validate the supplied range hash against current content;
 *   small-file `str_replace` normally relies on exact oldString matching. In
 *   strict read-before-edit mode, supplied anchors are validated regardless of
 *   file size. Range capabilities do not authorize whole-file overwrites.
 * - For anchored `str_replace`/`edit_transaction`, a
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
 * edit_transaction. Authenticated cap.v3 tokens can satisfy
 * strict read-before-edit for their bound path; legacy forms cannot authorize
 * an otherwise unread path.
 */
export const basedOnReadSchema = z
  .union([
    z
      .string()
      .min(1)
      .describe(
        'The single authenticated cap.v3 readCapability copied verbatim from a fresh read_files range header. Preferred: it binds the project, path, run, range, and hash as one value.',
      ),
    basedOnReadRangeSchema,
  ])
  .optional()
  .describe(
    'Optional range anchor from a fresh read_files call. Prefer the authenticated cap.v3 readCapability: it is bound to the current project, target path, and run. The legacy { startLine, endLine, hash } form remains a freshness assertion but cannot authorize an otherwise unread path in strict mode. Range capabilities never authorize whole-file overwrites. Only copy capabilities from a successful fresh read.',
  )
