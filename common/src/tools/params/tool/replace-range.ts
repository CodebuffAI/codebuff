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
    readCapability: z
      .string()
      .min(1)
      .describe(
        'Copy the cap.v3 readCapability verbatim from the matching fresh read_files editAnchor. The token supplies the observed line bounds and content hash.',
      ),
    startLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional 1-indexed target start within the capability-covered range. Omit with endLine to replace the complete observed range.',
      ),
    endLine: z
      .number()
      .int()
      .min(1)
      .optional()
      .describe(
        'Optional 1-indexed target end within the capability-covered range. Omit with startLine to replace the complete observed range.',
      ),
    newContent: z
      .string()
      .refine((value) => !isObviousEditPlaceholder(value), {
        message:
          'newContent is an explicit placeholder. Provide the complete replacement content for the range.',
      })
      .describe('Complete replacement content for the selected line range.'),
  })
  .strict()
  .superRefine((input, ctx) => {
    const decoded = decodeReadCapabilityToken(input.readCapability)
    if (typeof decoded === 'string' || decoded.tokenVersion !== 'v3') {
      ctx.addIssue({
        code: 'custom',
        path: ['readCapability'],
        message:
          typeof decoded === 'string'
            ? decoded
            : 'readCapability requires an authenticated project/path/run-bound cap.v3 token.',
      })
      return
    }
    const hasStart = input.startLine !== undefined
    const hasEnd = input.endLine !== undefined
    if (hasStart !== hasEnd) {
      ctx.addIssue({
        code: 'custom',
        message: 'Provide startLine and endLine together, or omit both.',
      })
      return
    }
    if (
      hasStart &&
      hasEnd &&
      (input.startLine! < decoded.startLine ||
        input.endLine! > decoded.endLine ||
        input.startLine! > input.endLine!)
    ) {
      ctx.addIssue({
        code: 'custom',
        message: `Target lines must be contained within the readCapability range ${decoded.startLine}-${decoded.endLine}.`,
      })
    }
  })
  .describe(
    'Replace all or a contained sub-range of content observed through one fresh cap.v3 read capability.',
  )

const inputSchema = rawInputSchema.transform((input) => {
  const decoded = decodeReadCapabilityToken(input.readCapability)
  if (typeof decoded === 'string') {
    throw new Error(decoded)
  }
  return {
    ...input,
    startLine: input.startLine ?? decoded.startLine,
    endLine: input.endLine ?? decoded.endLine,
    capabilityStartLine: decoded.startLine,
    capabilityEndLine: decoded.endLine,
    capabilityHash: decoded.hash,
  }
})

const providerInputSchema = rawInputSchema

const description = `
Use this tool for reliable edits to an exact file range you have read. It mutates the range bound into a fresh cap.v3 readCapability and echoes a fresh capability for the edited state, avoiding re-read loops.

Important:
- Copy the single cap.v3 readCapability token verbatim from the matching fresh read_files editAnchor.
- The token supplies the observed line bounds and content hash. To replace only part of the observed content, pass startLine and endLine together; they must remain inside the token's range.
- Never pass expectedHash. The runtime derives and verifies freshness from the authenticated capability.
- Do not include a trailing phantom line beyond the visible file length; if a stale-range diagnostic reports the current file length, re-read a valid range.
- The runtime verifies the current range hash before editing and rejects stale edits before changing the file.
- newContent replaces the entire selected range, so include all lines that should remain in that range.
- Never pass an out-of-band reference such as "[see patch above]"; newContent must be complete.

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
