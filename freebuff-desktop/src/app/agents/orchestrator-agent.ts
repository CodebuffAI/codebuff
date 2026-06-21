/**
 * The orchestrator chat agent (§19) — the single agent the human talks to. It
 * does NOT write code; it owns the task graph via the custom tools below, which
 * are thin wrappers over the in-process `Orchestrator` (the §19 tool surface).
 */

import { getCustomToolDefinition } from '@codebuff/sdk'
import type { CustomToolDefinition } from '@codebuff/sdk'
import { z } from 'zod/v4'

import { Orchestrator, OrchestratorError } from '../../core/orchestrator'
import type { TaskOrigin } from '../../core/types'
import { FREEBUFF_MODEL } from '../models'

type ToolResult = { type: 'json'; value: any }

/** Run an orchestrator call, surfacing OrchestratorError as a model-readable result. */
function guard(fn: () => unknown): ToolResult[] {
  try {
    return [{ type: 'json', value: fn() ?? { ok: true } }]
  } catch (err) {
    if (err instanceof OrchestratorError) {
      return [{ type: 'json', value: { error: err.code, message: err.message } }]
    }
    return [
      {
        type: 'json',
        value: { error: 'internal', message: (err as Error).message },
      },
    ]
  }
}

/**
 * Build the §19 tool set bound to a project's Orchestrator. `origin` tags created
 * tasks — `human` for the chat agent, `scout` when the Scout reuses these tools.
 */
export function buildOrchestratorTools(
  orch: Orchestrator,
  origin: TaskOrigin = 'human',
  /** Called when send_guidance validates, so the engine can deliver it to the task. */
  onGuidance?: (taskId: string, message: string) => void,
): CustomToolDefinition<string, any, any>[] {
  return [
    getCustomToolDefinition({
      toolName: 'create_task',
      description:
        'Create one coherent, reviewable task. Title is a short imperative ' +
        'phrase; description is the full spec the task agent will implement from. ' +
        'Pass parents only if this task genuinely cannot start until those tasks ' +
        'have merged.',
      inputSchema: z.object({
        title: z.string(),
        description: z.string(),
        parents: z.array(z.string()).optional(),
        rationale: z.string().optional(),
      }),
      endsAgentStep: false,
      exampleInputs: [
        { title: 'Add a dark-mode toggle', description: 'A theme switch in the header that persists to localStorage.' },
      ],
      execute: async (input) =>
        guard(() =>
          orch.createTask(
            { title: input.title, description: input.description, parents: input.parents },
            { origin, rationale: input.rationale ?? null },
          ),
        ),
    }),

    getCustomToolDefinition({
      toolName: 'update_task',
      description: 'Edit a task’s title and/or description.',
      inputSchema: z.object({
        taskId: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
      }),
      endsAgentStep: false,
      exampleInputs: [{ taskId: 'task-1', description: 'Updated spec.' }],
      execute: async (input) => guard(() => orch.updateTask(input)),
    }),

    getCustomToolDefinition({
      toolName: 'add_dependency',
      description:
        '"to depends on from": the `to` task waits until the `from` task is ' +
        'merged. Rejected if it would create a cycle. Prefer independent tasks.',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      endsAgentStep: false,
      exampleInputs: [{ from: 'task-1', to: 'task-2' }],
      execute: async (input) => guard(() => orch.addDependency(input)),
    }),

    getCustomToolDefinition({
      toolName: 'remove_dependency',
      description: 'Remove a dependency edge between two tasks.',
      inputSchema: z.object({ from: z.string(), to: z.string() }),
      endsAgentStep: false,
      exampleInputs: [{ from: 'task-1', to: 'task-2' }],
      execute: async (input) => guard(() => orch.removeDependency(input)),
    }),

    getCustomToolDefinition({
      toolName: 'abandon_task',
      description:
        'Stop a task and drop it; its unmerged dependents become blocked.',
      inputSchema: z.object({ taskId: z.string() }),
      endsAgentStep: false,
      exampleInputs: [{ taskId: 'task-1' }],
      execute: async (input) => guard(() => orch.abandonTask(input)),
    }),

    getCustomToolDefinition({
      toolName: 'send_guidance',
      description:
        'Route a steer to a running task agent (e.g. "also handle SSO"). Only ' +
        'works on a live task.',
      inputSchema: z.object({ taskId: z.string(), message: z.string() }),
      endsAgentStep: false,
      exampleInputs: [{ taskId: 'task-1', message: 'Also cover the mobile layout.' }],
      execute: async (input) =>
        guard(() => {
          const r = orch.sendGuidance(input) // validates the task is live (throws otherwise)
          onGuidance?.(r.taskId, r.message)
          return r
        }),
    }),

    getCustomToolDefinition({
      toolName: 'get_task',
      description: 'Inspect one task’s status, current stage, PR and parents.',
      inputSchema: z.object({ taskId: z.string() }),
      endsAgentStep: false,
      exampleInputs: [{ taskId: 'task-1' }],
      execute: async (input) => guard(() => orch.getTask(input)),
    }),

    getCustomToolDefinition({
      toolName: 'list_tasks',
      description: 'List the project’s tasks (optionally filtered by status).',
      inputSchema: z.object({
        status: z
          .enum([
            'proposed',
            'ready',
            'running',
            'awaiting-approval',
            'merged',
            'blocked',
            'failed',
            'abandoned',
          ])
          .optional(),
      }),
      endsAgentStep: false,
      exampleInputs: [{}, { status: 'awaiting-approval' }],
      execute: async (input) => guard(() => orch.listTasks(input)),
    }),

    getCustomToolDefinition({
      toolName: 'read_doc',
      description:
        'Read a governing doc (product, priorities, technical, implementation, ' +
        'review, testing, task-generation, learning). To CHANGE a doc, create a ' +
        'normal task instead — doc writes ship via PRs.',
      inputSchema: z.object({
        name: z.enum([
          'product',
          'priorities',
          'technical',
          'implementation',
          'review',
          'testing',
          'task-generation',
          'learning',
        ]),
      }),
      endsAgentStep: false,
      exampleInputs: [{ name: 'priorities' }],
      execute: async (input) =>
        guard(() => ({ name: input.name, content: orch.readDoc(input) })),
    }),
  ]
}

const ORCHESTRATOR_SYSTEM_PROMPT = `You are the Orchestrator for Freebuff Desktop — a GitHub-native coding-agent
cockpit. You do NOT write code. Your job is to turn what the user wants into a
clean graph of tasks and keep it moving.

How to work:
- Decompose a request into one or more coherent, independently-reviewable tasks,
  each sized to a single PR. Smaller is usually better.
- Call create_task once per distinct task. Give each a short imperative title and
  a concrete description the implementing agent can work from without you.
- Parallelism vs. conflicts: independent tasks run in parallel, which is great —
  BUT two tasks that edit the SAME file collide at merge. So when several tasks
  will touch one shared file (very common for a single-file app or a one-page
  site — everything lands in index.html), CHAIN them LINEARLY: each task depends on
  the PREVIOUS one (t1 → t2 → t3 → …), not all on the first. A linear chain means
  only one task edits the file at a time, so nothing collides. Do NOT make a "star"
  (several tasks all depending on the skeleton but parallel to each other) — those
  siblings still edit the same file and conflict. Reserve parallelism for tasks
  that touch genuinely different files/areas. When unsure, prefer a linear chain.
- After creating tasks, briefly tell the user what you set up. Don't ask for
  permission to create obvious tasks — just do it. Ask a clarifying question only
  when the request is genuinely ambiguous.
- Use list_tasks / get_task to answer status questions. Use send_guidance to steer
  a running task. Use read_doc to ground decisions in the project's priorities.

You are concise and action-oriented.`

/** The orchestrator agent definition (deepseek-v4-flash, §13). */
export function orchestratorAgentDefinition(toolNames: string[]) {
  return {
    id: 'freebuff-desktop-orchestrator',
    displayName: 'Freebuff Orchestrator',
    model: FREEBUFF_MODEL,
    toolNames,
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    instructionsPrompt:
      'Decompose the request into tasks now using your tools. Be concise.',
  }
}
