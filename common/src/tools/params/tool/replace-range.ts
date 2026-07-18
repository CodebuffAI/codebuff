import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
} from '../utils'
import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../util/content-hash'

import { updateFileResultSchema } from './str-replace'

import type { $ToolParams } from '../../constants'

const toolName = 'replace_range'
const endsAgentStep = false

const rawInputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe('The path to the file to edit.'),
    startLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        '1-indexed inclusive start line from a fresh read_files.ranges result. Omit when readCapability is supplied.',
      ),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        '1-indexed inclusive end line from a fresh read_files.ranges result. Omit when readCapability is supplied.',
      ),
    expectedHash: z
      .string()
      .min(1)
      .optional()
      .describe(
        'The sha256 rangeHash returned by read_files.ranges for this exact range. Omit when readCapability is supplied.',
      ),
    readCapability: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Preferred target anchor: copy the cap.* readCapability verbatim from a fresh read_files range header, OR from a read_files.paths whole-file read header (the editAnchor.readCapability for a whole-file read), OR use the wholeFileReadCapability field emitted alongside a read_files.ranges sub-range result. A range capability authorizes exactly its own bounds; a whole-file capability (lines 1-N) may be combined with narrower startLine/endLine to target a sub-range of a file you have already fully observed (do NOT pass expectedHash in that combined form — the runtime derives it). The token safely supplies startLine, endLine, and expectedHash as one value.',
      ),
    newContent: z
      .string()
      .refine((value) => !isObviousEditPlaceholder(value), {
        message:
          'newContent is an explicit placeholder. Provide the complete replacement content for the range.',
      })
      .describe('Complete replacement content for the selected line range.'),
  })
  .superRefine((input, ctx) => {
    const explicitTarget = [input.startLine, input.endLine, input.expectedHash]
    const hasAnyExplicitTarget = explicitTarget.some(
      (value) => value !== undefined,
    )
    const hasCompleteExplicitTarget = explicitTarget.every(
      (value) => value !== undefined,
    )
    if (hasAnyExplicitTarget && !hasCompleteExplicitTarget) {
      ctx.addIssue({
        code: 'custom',
        message:
          'Provide startLine, endLine, and expectedHash together, or provide only readCapability.',
      })
    }
    if (!hasCompleteExplicitTarget && !input.readCapability) {
      ctx.addIssue({
        code: 'custom',
        message:
          'replace_range requires either readCapability or the complete startLine/endLine/expectedHash tuple from a fresh range read.',
      })
    }
    if (
      input.startLine !== undefined &&
      input.endLine !== undefined &&
      input.startLine > input.endLine
    ) {
      ctx.addIssue({
        code: 'custom',
        message: 'startLine must be <= endLine',
      })
    }
    if (input.readCapability) {
      const decoded = decodeReadCapabilityToken(input.readCapability)
      if (typeof decoded === 'string') {
        ctx.addIssue({
          code: 'custom',
          path: ['readCapability'],
          message: decoded,
        })
      } else {
        // A whole-file capability (startLine === 1 and covering the whole
        // file) may be combined with a narrower caller-selected startLine/
        // endLine (but NOT expectedHash): the caller is selecting a sub-range
        // of a file they have already fully observed. A strict sub-range
        // capability combined with any explicit target is still rejected because
        // it would authorize an unobserved wider scope than the caller
        // intended; and expectedHash is never accepted alongside a capability
        // because its hash attests the capability's own bounds, not the
        // caller's sub-range.
        const capabilityIsStrictSubRange =
          decoded.startLine !== 1 || input.expectedHash !== undefined
        // When the caller supplies only startLine/endLine alongside a
        // whole-file capability, that is the whole-file-capability +
        // sub-range form and is allowed through.
        const hasExplicitHash = input.expectedHash !== undefined
        const isWholeFilePlusSubRangeRequest =
          !capabilityIsStrictSubRange &&
          input.startLine !== undefined &&
          input.endLine !== undefined &&
          !hasExplicitHash
        if (capabilityIsStrictSubRange && hasAnyExplicitTarget) {
          ctx.addIssue({
            code: 'custom',
            path: ['readCapability'],
            message: `Use one range target form only: provide readCapability by itself, or provide startLine/endLine/expectedHash without readCapability. The capability covers lines ${decoded.startLine}-${decoded.endLine}.`,
          })
        } else if (hasExplicitHash && input.readCapability) {
          ctx.addIssue({
            code: 'custom',
            path: ['readCapability'],
            message: `Combine readCapability with at most startLine/endLine (selecting a sub-range); do not also pass expectedHash — the runtime derives the hash from the capability.`,
          })
        } else if (
          !isWholeFilePlusSubRangeRequest &&
          (input.startLine !== undefined || input.endLine !== undefined) &&
          input.startLine !== undefined &&
          input.endLine !== undefined &&
          (decoded.startLine !== input.startLine ||
            decoded.endLine !== input.endLine) &&
          capabilityIsStrictSubRange
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['readCapability'],
            message: `readCapability covers lines ${decoded.startLine}-${decoded.endLine} which is a strict sub-range; it cannot be combined with a different startLine/endLine. Pass a whole-file capability (lines 1-N) to target a narrower sub-range.`,
          })
        }
      }
    }
  })
  .describe(
    'Replace a previously read line range only if its capability/hash still matches.',
  )

const inputSchema = rawInputSchema.transform((input) => {
  if (!input.readCapability) {
    return {
      ...input,
      startLine: input.startLine!,
      endLine: input.endLine!,
      expectedHash: input.expectedHash!,
      // No whole-file capability present on the legacy explicit-tuple form.
      wholeFileCapabilityHash: undefined,
    }
  }
  const decoded = decodeReadCapabilityToken(input.readCapability)
  if (typeof decoded === 'string') {
    // superRefine above rejects this branch; retain a deterministic shape for
    // TypeScript without weakening malformed-token validation.
    return {
      ...input,
      startLine: input.startLine!,
      endLine: input.endLine!,
      expectedHash: input.expectedHash!,
      wholeFileCapabilityHash: undefined,
    }
  }
  // When the caller supplies their own startLine/endLine alongside a
  // whole-file capability, KEEP the caller's bounds and leave expectedHash
  // undefined so the runtime preflight computes it from current content at
  // apply time. Carry decoded.hash as wholeFileCapabilityHash so the runtime
  // can verify the whole-file hash attests the model saw the full file.
  const callerSuppliedBounds =
    input.startLine !== undefined && input.endLine !== undefined
  const callerBoundsEqualCapability =
    callerSuppliedBounds &&
    input.startLine === decoded.startLine &&
    input.endLine === decoded.endLine
  if (callerSuppliedBounds && !callerBoundsEqualCapability) {
    // Whole-file capability + strict sub-range request. The runtime preflight
    // verifies decoded.hash equals the whole-file hash of current content,
    // then accepts the requested sub-range.
    return {
      ...input,
      startLine: input.startLine!,
      endLine: input.endLine!,
      expectedHash: undefined,
      wholeFileCapabilityHash: decoded.hash,
    }
  }
  // Capability bounds equal caller bounds (or caller supplied no bounds): use
  // the capability's bounds and hash directly.
  return {
    ...input,
    startLine: decoded.startLine,
    endLine: decoded.endLine,
    expectedHash: decoded.hash,
    wholeFileCapabilityHash: undefined,
  }
})

const providerInputSchema = z.object({
  path: z.string().min(1).describe('The file to edit.'),
  readCapability: z
    .string()
    .min(1)
    .describe('Copy editAnchor.readCapability from the matching fresh range.'),
  newContent: z.string().describe('Complete replacement content.'),
})

const description = `
Use this tool for reliable edits to any file you have read (medium, large, or even short). It is recommended for ANY edit to a file the model has recently read, not just large files: it mutates an exact line range and echoes a fresh readCapability for the edited region, avoiding re-read loops.

Important:
- Prefer copying the single readCapability token verbatim from a fresh read_files.ranges RANGE header, OR from a read_files.paths whole-file read header (the editAnchor.readCapability emitted by a whole-file read). readCapability can be copied from EITHER source.
  - A range capability authorizes exactly its own bounds.
  - A whole-file capability (lines 1-N) may be combined with narrower startLine/endLine to target a sub-range of a file you have already fully observed; the runtime verifies the whole-file hash, then accepts your requested sub-range. Do NOT pass expectedHash in this combined form — the runtime derives it.
- The legacy startLine/endLine/expectedHash form remains supported, but all three values must come from the same fresh range read. Do not mix it with a conflicting readCapability.
- Do not include a trailing phantom line beyond the visible file length; if a stale-range diagnostic reports the current file length, re-read with endLine <= that line count.
- The runtime verifies the current range hash before editing and rejects stale edits before changing the file.
- newContent replaces the entire selected range, so include all lines that should remain in that range.
- Never pass an out-of-band reference such as "[see patch above]"; newContent must be complete.
- Prefer this over str_replace for large-file function/block edits or line-count-changing changes.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: 'path/to/large-file.ts',
    readCapability: encodeReadCapabilityToken({
      startLine: 120,
      endLine: 135,
      hash: getContentHash('freshly read example range'),
      scope: {
        projectId: '/example/project',
        path: 'path/to/large-file.ts',
        runId: 'example-run',
      },
    }),
    newContent: 'function updated() {\n  return true\n}',
  },
  endsAgentStep,
})}
`.trim()

export const replaceRangeParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  providerInputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
