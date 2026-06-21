import z from 'zod/v4'

import { updateFileResultSchema } from './str-replace'
import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'update_plan_status'
const endsAgentStep = false

const taskUpdateSchema = z
  .object({
    task: z
      .string()
      .min(1, 'task cannot be empty')
      .describe(
        'Substring of the existing task/checklist line to match (case-insensitive). The first matching `- [ ]`/`- [x]` line in the artifact will be updated in place.',
      ),
    completed: z
      .boolean()
      .optional()
      .describe(
        'When provided, sets the checkbox state of the matched line (true -> `[x]`, false -> `[ ]`). When omitted, the checkbox is left unchanged.',
      ),
    note: z
      .string()
      .optional()
      .describe(
        'Optional short note to append to the matched line in parentheses. Preserves any existing trailing text on the line.',
      ),
  })
  .describe('Targeted update to a single existing checklist line.')

const appendEntrySchema = z
  .object({
    heading: z
      .string()
      .min(1, 'heading cannot be empty')
      .describe(
        'Short heading for an appended entry. Used to form a clearly delimited block (`## <heading> — <timestamp>`).',
      ),
    body: z
      .string()
      .min(1, 'body cannot be empty')
      .describe(
        'Markdown body for the appended entry. Written verbatim under the heading.',
      ),
  })
  .describe(
    'Appended entry written under a delimited heading at the end of the artifact when no targeted task line matches.',
  )

const inputSchema = z
  .object({
    path: z
      .string()
      .min(1, 'Path cannot be empty')
      .describe(
        'Artifact path. Must be `.agents/sessions/<slug>/STATUS.md` or `.agents/sessions/<slug>/LESSONS.md`. Absolute paths and `..` traversal are rejected.',
      ),
    updates: z
      .preprocess(coerceToArray, z.array(taskUpdateSchema))
      .optional()
      .describe(
        'Targeted updates applied in order. Each entry rewrites at most one matching checklist line; unmatched updates fall through to `append`.',
      ),
    append: appendEntrySchema
      .optional()
      .describe(
        'Optional delimited entry appended at the end of the artifact (used when there is no matching task line for the change being recorded).',
      ),
  })
  .refine(
    (input) =>
      (input.updates && input.updates.length > 0) || input.append !== undefined,
    {
      message: 'Provide at least one `updates` entry or an `append` entry.',
    },
  )
  .describe(
    'Update a durable plan session artifact (STATUS.md or LESSONS.md) in place. Preserves surrounding user prose; only rewrites matching checklist lines or appends a clearly delimited entry.',
  )

const description = `
Use this tool to record durable progress in a plan session without rewriting the whole artifact.

Allowed paths (strict):
- \`.agents/sessions/<slug>/STATUS.md\`
- \`.agents/sessions/<slug>/LESSONS.md\`

Absolute paths and any \`..\` segment are rejected. The tool will not create the session directory itself; use \`create_plan\` to bootstrap a new session, then use \`update_plan_status\` for incremental edits.

Two operations, both optional but at least one required:
- \`updates\`: Each entry finds the first checklist line (\`- [ ]\` or \`- [x]\`) whose text contains \`task\` (case-insensitive) and rewrites just that line, preserving any leading indentation and trailing prose. \`completed\` toggles the checkbox; \`note\` appends \` (<note>)\` after the line's main text.
- \`append\`: When no targeted line matches (or for free-form lessons), the entry is written at the end of the file under \`## <heading> — <ISO timestamp>\` so it is clearly delimited and easy to scan.

This tool preserves user prose: it never rewrites unmatched lines, never reorders content, and only appends when explicitly requested.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: '.agents/sessions/harness-audit-2026-06/STATUS.md',
    updates: [
      {
        task: 'P0-11 update_plan_status tool',
        completed: true,
        note: 'shipped',
      },
    ],
    append: {
      heading: 'Resume notes',
      body: 'Next: wire CLI gate-state renderer behind feature flag.',
    },
  },
  endsAgentStep,
})}
`.trim()

export const updatePlanStatusParams = {
  toolName,
  endsAgentStep,
  description,
  inputSchema,
  outputSchema: jsonToolResultSchema(updateFileResultSchema),
} satisfies $ToolParams
