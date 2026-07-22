import z from 'zod/v4'

import { decodeReadCapabilityToken } from '../../util/content-hash'

/**
 * Shared model-facing `basedOnRead` capability schema.
 *
 * A supplied value must be the single authenticated cap.v3 readCapability
 * copied from a fresh `read_files` editAnchor. The token binds its range and
 * hash to the issuing project, target path, and run. Tool runtimes perform the
 * final scope and freshness checks; range capabilities never authorize
 * whole-file overwrites.
 */
export const basedOnReadSchema = z
  .string()
  .min(1)
  .superRefine((token, ctx) => {
    const decoded = decodeReadCapabilityToken(token)
    if (typeof decoded === 'string' || decoded.tokenVersion !== 'v3') {
      ctx.addIssue({
        code: 'custom',
        message:
          typeof decoded === 'string'
            ? decoded
            : 'basedOnRead requires an authenticated project/path/run-bound cap.v3 token from a fresh read_files editAnchor.',
      })
    }
  })
  .optional()
  .describe(
    'Optional authenticated cap.v3 readCapability copied verbatim from the matching fresh read_files editAnchor.',
  )

/** Canonical model-facing anchor shared by mutation tool schemas. */
export const canonicalBasedOnReadSchema = basedOnReadSchema
