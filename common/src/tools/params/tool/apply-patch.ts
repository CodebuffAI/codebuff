import z from 'zod/v4'

import {
  $getNativeToolCallExampleString,
  isObviousEditPlaceholder,
  jsonToolResultSchema,
} from '../utils'
import { basedOnReadRangeSchema } from '../based-on-read'
import { fileMutationResultV1Schema } from '../../results/filesystem'
import {
  decodeReadCapabilityToken,
  encodeReadCapabilityToken,
  getContentHash,
} from '../../../util/content-hash'

import type { $ToolParams } from '../../constants'

export const applyPatchResultSchema = z.union([
  fileMutationResultV1Schema,
  z.object({
    message: z.string(),
    applied: z.array(
      z.object({
        file: z.string(),
        action: z.enum(['add', 'update', 'delete']),
      }),
    ),
  }),
  z.object({
    file: z.string().optional(),
    errorMessage: z.string(),
    errorCode: z.string().optional(),
    recovery: z
      .object({
        tool: z.literal('read_files'),
        input: z.object({ paths: z.array(z.string().min(1)).min(1) }),
      })
      .optional(),
  }),
])

const toolName = 'apply_patch'
const endsAgentStep = false
const patchTextSchema = z
  .string()
  .min(1, 'Diff cannot be empty')
  .refine((value) => !isObviousEditPlaceholder(value), {
    message:
      'diff is an explicit placeholder. Provide the complete unified diff in this tool call.',
  })

const scopedReadCapabilityTokenSchema = z.string().superRefine((token, ctx) => {
  const decoded = decodeReadCapabilityToken(token)
  if (typeof decoded === 'string' || decoded.tokenVersion !== 'v3') {
    ctx.addIssue({
      code: 'custom',
      message:
        typeof decoded === 'string'
          ? decoded
          : 'apply_patch strict authorization requires a project/path/run-bound cap.v3 token from a fresh read_files range.',
    })
  }
})

const operationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_file'),
    path: z.string().min(1, 'Path cannot be empty'),
    diff: patchTextSchema,
  }),
  z.object({
    type: z.literal('update_file'),
    path: z.string().min(1, 'Path cannot be empty'),
    diff: patchTextSchema,
    basedOnRead: z
      .array(z.union([scopedReadCapabilityTokenSchema, basedOnReadRangeSchema]))
      .optional()
      .describe(
        'Required for large-file update patches. Prefer one authenticated cap.v3 token per touched hunk, copied from fresh read_files.ranges headers. Legacy range objects remain freshness checks but cannot authorize an otherwise unread path in strict mode.',
      ),
  }),
  z.object({
    type: z.literal('delete_file'),
    path: z.string().min(1, 'Path cannot be empty'),
  }),
])

export type ApplyPatchOperation = z.infer<typeof operationSchema>

const inputSchema = z
  .object({
    operation: operationSchema.describe(
      'The file operation to perform. type is one of create_file, update_file, or delete_file.',
    ),
  })
  .describe('Apply a file operation (create, update, or delete).')

const providerOperationSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('create_file'),
    path: z.string().min(1),
    diff: patchTextSchema,
  }),
  z.object({
    type: z.literal('update_file'),
    path: z.string().min(1),
    diff: patchTextSchema,
    basedOnRead: z.array(scopedReadCapabilityTokenSchema).optional(),
  }),
  z.object({
    type: z.literal('delete_file'),
    path: z.string().min(1),
  }),
])
const providerInputSchema = z.object({ operation: providerOperationSchema })

const description = `
Use this tool to apply file operations using Codex-style apply_patch format.

Each call performs a single operation on one file.
Every diff must be self-contained. References such as "[see patch above]" are rejected because tool calls do not share an out-of-band patch buffer.

Operation types:
- create_file: Create a new file. Requires path and diff (lines prefixed with +).
- update_file: Update an existing file. Requires path and diff (unified diff with @@ hunks). For large files, also requires basedOnRead capabilities copied from fresh read_files.ranges headers for every touched hunk.
- delete_file: Delete a file. Requires only path.

Example (create):
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    operation: {
      type: 'create_file',
      path: 'hello.txt',
      diff: '@@\n+Hello world\n',
    },
  },
  endsAgentStep,
})}

Example (update):
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    operation: {
      type: 'update_file',
      path: 'lib/fib.py',
      diff: '@@\n-def fib(n):\n+def fibonacci(n):\n     if n <= 1:\n         return n\n-    return fib(n-1) + fib(n-2)\n+    return fibonacci(n-1) + fibonacci(n-2)\n',
      basedOnRead: [
        encodeReadCapabilityToken({
          startLine: 1,
          endLine: 5,
          hash: getContentHash('freshly read patch range'),
          scope: {
            projectId: '/example/project',
            path: 'lib/fib.py',
            runId: 'example-run',
          },
        }),
      ],
    },
  },
  endsAgentStep,
})}

Example (delete):
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    operation: {
      type: 'delete_file',
      path: 'old-file.txt',
    },
  },
  endsAgentStep,
})}
`.trim()

export const applyPatchParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  providerInputSchema,
  outputSchema: jsonToolResultSchema(applyPatchResultSchema),
} satisfies $ToolParams
