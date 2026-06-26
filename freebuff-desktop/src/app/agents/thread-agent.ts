/**
 * The thread agent — the single full coding agent the human talks to in a thread.
 * Unlike the old orchestrator (which only mutated a task graph), this agent does
 * the real work: it reads and edits files in the thread's git worktree, runs
 * commands, and ships changes. It runs once per turn with `previousRun` threaded
 * through so prompt caching carries across the conversation.
 *
 * Three custom tools wire it back to the engine:
 *  - suggest_prompts — propose follow-up prompts that park in the queue's
 *    suggested lane (replaces the old Scout).
 *  - write_doc       — append durable learnings to a governing doc (used by the
 *    `reflect` skill); surfaces the length-cap error so the agent condenses.
 *  - open_pr         — commit, push, and open a PR (used by the `open-pr` skill).
 */

import { getCustomToolDefinition } from '@codebuff/sdk'
import type { CustomToolDefinition } from '@codebuff/sdk'
import { z } from 'zod/v4'

import { DOC_NAMES, type DocName } from '../../core/types'
import { FREEBUFF_MODEL } from '../models'

/** A focused but real coding tool set (mirrors the base coding agent). */
export const THREAD_AGENT_TOOLS = [
  'read_files',
  'read_subtree',
  'list_directory',
  'glob',
  'code_search',
  'str_replace',
  'write_file',
  'run_terminal_command',
  'run_file_change_hooks',
  'set_output',
  'end_turn',
]

const THREAD_SYSTEM_PROMPT = `You are Freebuff, a capable coding agent working directly in this repository's
git worktree. You implement what the user asks: read the relevant code, make
focused edits, run commands to verify, and keep the working tree in a good state.

How to work:
- Do the task well and completely. Read surrounding code before changing it; match
  the existing style and conventions.
- Verify your work by running the project's commands when it matters (build, tests,
  or exercising the actual surface). Rendering is not correctness.
- Be concise in your prose. The user is watching a live transcript.
- When it's genuinely useful, call suggest_prompts to propose follow-up prompts the
  user might want to run next (a natural next feature, polish, or a cleanup the work
  created). These are suggestions only — they park in the queue for the user to
  accept or ignore. Don't propose busywork, and don't propose anything if the work
  feels complete.

Do not commit or open a PR unless a tool (open_pr) or the user asks you to.`

export function threadAgentDefinition(toolNames: string[]) {
  return {
    id: 'freebuff-desktop-thread',
    displayName: 'Freebuff',
    model: FREEBUFF_MODEL,
    toolNames,
    systemPrompt: THREAD_SYSTEM_PROMPT,
    instructionsPrompt: 'Work in the current repository. Be concise.',
  }
}

type ToolResult = { type: 'json'; value: any }

export interface ThreadToolDeps {
  /** Park proposed follow-up prompts in the thread's suggested lane. */
  onSuggest: (items: { prompt: string; label?: string }[]) => void
  /** Append (or replace) a governing doc. Returns ok/error (cap enforcement). */
  onWriteDoc: (
    name: DocName,
    content: string,
    mode: 'append' | 'replace',
  ) => { ok: boolean; error?: string }
  /** Commit + push + open a PR for the thread. */
  onOpenPr: () => Promise<{ url: string }>
}

/**
 * Build the per-thread custom tools (closures capture the engine callbacks).
 * Returned alongside the coding tools, these complete the agent's tool set.
 */
export function buildThreadTools(deps: ThreadToolDeps): CustomToolDefinition<string, any, any>[] {
  return [
    getCustomToolDefinition({
      toolName: 'suggest_prompts',
      description:
        'Propose one or more follow-up prompts the user might want to run next in ' +
        'this thread. They appear as suggestions the user can accept, edit, or ignore ' +
        '— they do NOT run automatically. Each needs a concrete prompt; a short label ' +
        'is optional.',
      inputSchema: z.object({
        prompts: z.array(
          z.object({ prompt: z.string(), label: z.string().optional() }),
        ),
      }),
      endsAgentStep: false,
      exampleInputs: [
        {
          prompts: [
            { prompt: 'Add tests for the new endpoint', label: 'Test the endpoint' },
          ],
        },
      ],
      execute: async (input): Promise<ToolResult[]> => {
        const items = input.prompts.filter((p) => p.prompt.trim())
        deps.onSuggest(items)
        return [{ type: 'json', value: { ok: true, added: items.length } }]
      },
    }),

    getCustomToolDefinition({
      toolName: 'write_doc',
      description:
        'Record durable, generally-useful learnings into a governing doc (product, ' +
        'priorities, technical, learning). Defaults to appending. There is a length ' +
        'cap — if the write exceeds it you must condense and try again.',
      inputSchema: z.object({
        name: z.enum(['product', 'priorities', 'technical', 'learning']),
        content: z.string(),
        mode: z.enum(['append', 'replace']).optional(),
      }),
      endsAgentStep: false,
      exampleInputs: [
        { name: 'learning', content: 'The build step requires Bun ≥ 1.3.' },
      ],
      execute: async (input): Promise<ToolResult[]> => {
        if (!(DOC_NAMES as readonly string[]).includes(input.name)) {
          return [{ type: 'json', value: { error: 'unknown_doc', message: input.name } }]
        }
        const r = deps.onWriteDoc(
          input.name as DocName,
          input.content,
          input.mode ?? 'append',
        )
        return [{ type: 'json', value: r.ok ? { ok: true } : { error: 'cap', message: r.error } }]
      },
    }),

    getCustomToolDefinition({
      toolName: 'open_pr',
      description:
        'Commit all changes in this thread, push the branch, and open a pull request. ' +
        'Returns the PR URL (or a local:// reference if the repo has no remote).',
      inputSchema: z.object({}),
      endsAgentStep: false,
      exampleInputs: [{}],
      execute: async (): Promise<ToolResult[]> => {
        try {
          const { url } = await deps.onOpenPr()
          return [{ type: 'json', value: { ok: true, url } }]
        } catch (err) {
          return [{ type: 'json', value: { error: 'open_pr_failed', message: (err as Error).message } }]
        }
      },
    }),
  ]
}
