import z from 'zod/v4'

import {
  PLAN_TASK_STATUSES,
  type PlanTaskStatus,
} from '@codebuff/common/util/plan-artifacts'
import { updateFileResultSchema } from './str-replace'
import {
  $getNativeToolCallExampleString,
  coerceToArray,
  jsonToolResultSchema,
} from '../utils'

import type { $ToolParams } from '../../constants'

const toolName = 'update_plan_status'
const endsAgentStep = false

const taskStatusSchema = z
  .enum(PLAN_TASK_STATUSES)
  .describe(
    'Tri-state task status. Maps to a checkbox mark: `pending` -> ` `, `in_progress` -> `~`, `done` -> `x`, `cancelled` -> `/`, `blocked` -> `!`. When `status` is provided it overrides `completed`.',
  )

const taskUpdateSchema = z
  .object({
    taskId: z
      .string()
      .min(1)
      .optional()
      .describe(
        'Stable task ID at the start of a checklist line (for example `P2-T3`). Preferred over substring matching.',
      ),
    task: z
      .string()
      .min(1, 'task cannot be empty')
      .optional()
      .describe(
        'Substring of the existing task/checklist line to match (case-insensitive). The first matching `- [ ]`/`-[x]`/`-[~]`/`-[/]`/`-[!]` line in the artifact will be updated in place.',
      ),
    completed: z
      .boolean()
      .optional()
      .describe(
        'When provided, sets the checkbox state of the matched line (true -> `[x]`, false -> `[ ]`). Ignored when `status` is also provided.',
      ),
    status: taskStatusSchema
      .optional()
      .describe(
        'Explicit tri-state task status. When provided, overrides `completed`. Transitions a task to `in_progress` (`[~]`), `done` (`[x]`), `cancelled` (`[/]`), `blocked` (`[!]`), or back to `pending` (`[ ]`).',
      ),
    note: z
      .string()
      .optional()
      .describe(
        'Optional short note to append to the matched line in parentheses. Preserves any existing trailing text on the line.',
      ),
  })
  .refine(
    (update) => update.taskId !== undefined || update.task !== undefined,
    {
      message: 'Provide taskId or task.',
    },
  )
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
        'Artifact path. Must be `.agents/sessions/<slug>/PLAN.md`, `.agents/sessions/<slug>/STATUS.md`, or `.agents/sessions/<slug>/LESSONS.md`. Absolute paths and `..` traversal are rejected. Editing PLAN.md is permitted only for tri-state task toggles (not full overwrites).',
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
    sessionStatus: z
      .enum([
        'draft',
        'ready',
        'active',
        'executing',
        'validating',
        'reviewing',
        'blocked',
        'paused',
        'completed',
        'archived',
      ])
      .optional()
      .describe(
        'Optional session-level status transition. When provided, `.agents/sessions/<slug>/STATE.json` is created or updated to reflect the new lifecycle status.',
      ),
    currentTask: z
      .string()
      .optional()
      .describe(
        'Optional current-task pointer written as a `<!-- current-task: <task> -->` annotation in PLAN.md. Pass an empty string or omit to clear the pointer. Only takes effect when path targets PLAN.md.',
      ),
    expectedRevision: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        'Optional STATE.json compare-and-swap revision. The update fails without writing when the current revision differs.',
      ),
    checkpoint: z
      .object({
        taskId: z.string().min(1),
        phase: z.enum(['validation', 'review']),
        passed: z.boolean(),
        summary: z.string().optional(),
        receiptIds: z
          .array(z.string().min(1))
          .transform((ids) => (ids.length > 0 ? ids : undefined))
          .optional(),
      })
      .optional()
      .describe(
        'Validation or review evidence associated with a stable task ID. Completing a PLAN task requires a passed validation checkpoint with receiptIds.',
      ),
  })
  .refine(
    (input) =>
      (input.updates && input.updates.length > 0) ||
      input.append !== undefined ||
      input.sessionStatus !== undefined ||
      input.currentTask !== undefined ||
      input.checkpoint !== undefined,
    {
      message:
        'Provide at least one `updates` entry, an `append` entry, a `sessionStatus`, or a `currentTask`.',
    },
  )
const description = `
Use this tool to record durable progress in a plan session without rewriting the whole artifact.

Allowed paths (strict):
- \`.agents/sessions/<slug>/PLAN.md\` (P0.18–19; tri-state task toggles and current-task pointer only)
- \`.agents/sessions/<slug>/STATUS.md\`
- \`.agents/sessions/<slug>/LESSONS.md\`

Absolute paths and any \`..\` segment are rejected. The tool will not create the session directory itself; use \`create_plan\` to bootstrap a new session, then use \`update_plan_status\` for incremental edits.

Two operations, both optional but at least one required:
- \`updates\`: Each entry finds the first checklist line whose text contains \`task\` (case-insensitive) and rewrites just that line, preserving any leading indentation and trailing prose. \`completed\` toggles the checkbox (binary); \`status\` accepts the tri-state value (\`pending\` / \`in_progress\` / \`done\` / \`cancelled\` / \`blocked\`) and overrides \`completed\`. \`note\` appends \` (<note>)\` after the line's main text.
- \`append\`: When no targeted line matches (or for free-form lessons), the entry is written at the end of the file under \`## <heading> — <ISO timestamp>\` so it is clearly delimited and easy to scan.

Session-level controls (also optional):
- \`sessionStatus\`: When provided, \`.agents/sessions/<slug>/STATE.json\` is created or updated with the new lifecycle status (active / paused / completed / archived). Useful for marking a plan finished without editing individual checklist lines.
- \`currentTask\`: When provided, the \`<!-- current-task: <task> -->\` annotation in PLAN.md is rewritten. Empty string clears the pointer. The executor reads this annotation to know what to work on next.

This tool preserves user prose: it never rewrites unmatched lines, never reorders content, and only appends when explicitly requested.

Example:
${$getNativeToolCallExampleString({
  toolName,
  inputSchema,
  input: {
    path: '.agents/sessions/harness-audit-2026-06/PLAN.md',
    updates: [
      {
        task: 'P0-11 update_plan_status tool',
        status: 'done',
        note: 'shipped',
      },
      {
        task: 'P0-12 memory-drift-guard',
        status: 'in_progress',
      },
    ],
    sessionStatus: 'active',
    currentTask: 'P0-12 memory-drift-guard',
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
