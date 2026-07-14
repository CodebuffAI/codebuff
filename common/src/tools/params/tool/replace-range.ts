import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
} from '../utils'
import { decodeReadCapabilityToken } from '../../../util/content-hash'

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
        'Preferred target anchor: copy the cap.* readCapability verbatim from a fresh read_files range header. It safely supplies startLine, endLine, and expectedHash as one value.',
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
      } else if (
        hasCompleteExplicitTarget &&
        (input.startLine !== decoded.startLine ||
          input.endLine !== decoded.endLine ||
          input.expectedHash !== decoded.hash)
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['readCapability'],
          message:
            'readCapability conflicts with the explicit startLine/endLine/expectedHash tuple. Copy one fresh anchor and do not mix values from different reads.',
        })
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
    }
  }
  return {
    ...input,
    startLine: decoded.startLine,
    endLine: decoded.endLine,
    expectedHash: decoded.hash,
  }
})

const description = `
Use this tool for reliable edits to medium and large files after reading an exact line range with read_files.ranges.

Important:
- Prefer copying the single readCapability token from a fresh read_files.ranges header. The runtime decodes and verifies its line bounds and hash.
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
    readCapability:
      'cap.v2.120.135.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
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
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
