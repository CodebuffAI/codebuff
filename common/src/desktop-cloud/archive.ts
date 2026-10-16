import { z } from 'zod/v4'

// Application budgets, shared by the importer, API and sandbox extractor.
export const CLOUD_ARCHIVE_BYTES = 4 * 1024 ** 3
export const CLOUD_EXPANDED_BYTES = 16 * 1024 ** 3
export const CLOUD_SOURCE_FILES = 200_000
export const CLOUD_UPLOAD_PART_BYTES = 8 * 1024 ** 2

/**
 * What a size refusal tells the user to DO.
 *
 * Both limits used to refuse with the bare number and nothing else, which
 * leaves the user with no move: "remove build output" would be wrong advice,
 * because the inventory ALREADY excludes `.git`, `.freebuff`, `node_modules`,
 * `dist`, `build`, `.next` and `.cache` (`harness/folder-seed.ts`). An account
 * that reaches 4 GiB compressed has that much real content — the error samples
 * are Unreal projects and ComfyUI trees — and its only lever is
 * `.freebuffignore`, which appears nowhere else in the Desktop UI. Measured
 * 2026-10-16 in Axiom over 7 days: 36 app sessions hit the archive limit and
 * 43 the source limit, still occurring on the current build.
 *
 * The sibling refusals already name their lever — `git/state-commit.ts`
 * ("or list it in .freebuffignore, and try again") and
 * `desktop-cloud/export.ts` (`EXPORT_LIMIT_MESSAGE`) — so these two follow
 * them. The numbers interpolate from the budgets above for the usual reason:
 * copy that repeats a number drifts from the thing that enforces it.
 */
const ADVICE =
  'List large folders — media, datasets, model weights, build caches — in .freebuffignore and retry.'
const gib = (bytes: number) => `${bytes / 1024 ** 3} GiB`
export const CLOUD_ARCHIVE_LIMIT_MESSAGE = `Project archive exceeds the ${gib(
  CLOUD_ARCHIVE_BYTES,
)} compressed limit. ${ADVICE}`
export const CLOUD_SOURCE_LIMIT_MESSAGE = `Cloud projects support up to ${gib(
  CLOUD_EXPANDED_BYTES,
)} of source files and ${CLOUD_SOURCE_FILES.toLocaleString('en-US')} files. ${ADVICE}`
// A shared project's multi-GiB checkpoint can outlast the old panel timeouts.
export const CLOUD_RESTORE_WAIT_MS = 15 * 60_000
export const archiveCheckpointSchema = z
  .object({
    key: z.string().max(512),
    bytes: z.number().int().positive().max(CLOUD_ARCHIVE_BYTES),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.literal(1),
  })
  .strict()
export const sourceArchiveSchema = z
  .object({
    checkpoint: archiveCheckpointSchema,
    id: z.string().uuid(),
  })
  .strict()
export type SourceArchive = z.infer<typeof sourceArchiveSchema>
