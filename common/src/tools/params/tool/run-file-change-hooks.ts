import z from 'zod/v4'

import { terminalCommandOutputSchema } from './run-terminal-command'
import { $getNativeToolCallExampleString, jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'run_file_change_hooks'
const endsAgentStep = true
const inputSchema = z.object({
  files: z
    .array(z.string())
    .describe(
      `List of file paths that were changed and should trigger file change hooks`,
    ),
})
const description = `
Purpose: Trigger client-configured and manifest-inferred native validation for the specified files. Results include normalized compiler/linter diagnostics with exact file/range/code fields when the underlying tool reports them.

Use cases:
- After making code changes, trigger the relevant tests and checks
- Ensure code quality by running configured linters and type checkers
- Validate that changes don't break the build

The client will run only the hooks whose filePattern matches the provided files.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    files: ['src/components/Button.tsx', 'src/utils/helpers.ts'],
  },
  endsAgentStep,
})}
`.trim()

const diagnosticSchema = z.object({
  file: z.string().nullable(),
  range: z
    .object({
      start: z.object({
        line: z.number().int().positive(),
        column: z.number().int().positive(),
      }),
      end: z.object({
        line: z.number().int().positive(),
        column: z.number().int().positive(),
      }),
    })
    .nullable(),
  severity: z.enum(['error', 'warning', 'info', 'hint']),
  code: z.string().nullable(),
  message: z.string(),
  command: z.string(),
  source: z.string(),
})

export const runFileChangeHooksParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(
    z
      .union([
        terminalCommandOutputSchema.and(
          z.object({
            hookName: z.string(),
            diagnostics: z.array(diagnosticSchema).optional(),
          }),
        ),
        z.object({
          errorMessage: z.string(),
          hookName: z.string().optional(),
        }),
        z.object({
          validationStatus: z.enum(['no_hooks_configured', 'hooks_skipped']),
          message: z.string(),
          configuredHookCount: z.number().optional(),
          changedFiles: z.array(z.string()).optional(),
        }),
      ])
      .array(),
  ),
} satisfies $ToolParams
