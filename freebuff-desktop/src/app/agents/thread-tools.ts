/**
 * The Freebuff custom tools, defined ONCE in a SDK-neutral form and shared by both
 * harnesses. Each harness wraps these specs in its own SDK shape:
 *  - the Codebuff harness via `getCustomToolDefinition` (see buildThreadTools in
 *    thread-agent.ts),
 *  - the Claude Code harness via the Anthropic SDK's `tool()` exposed over an
 *    in-process MCP server (see buildFreebuffMcpTools in claude-code-harness.ts).
 *
 * Keeping the descriptions, schemas, and execute logic here means a tool change is
 * made in one place instead of being hand-synced across two SDK formats. The same
 * goes for {@link SUGGEST_PROMPTS_GUIDANCE}, which both harnesses' system prompts
 * compose in.
 */

import { z } from 'zod/v4'

import type { BrowserCheckResult } from '../../core/browser-check'
import { DOC_NAMES, type DocName } from '../../core/types'

export interface ThreadToolDeps {
  /** Park proposed follow-up prompts in the thread's suggested lane. */
  onSuggest: (items: { prompt: string; label?: string }[]) => void
  /** Append (or replace) a governing doc. Returns ok/error (cap enforcement). */
  onWriteDoc: (
    name: DocName,
    content: string,
    mode: 'append' | 'replace',
  ) => { ok: boolean; error?: string }
  /** Load the thread's work in a real headless browser and report what it saw. */
  onBrowserCheck: () => Promise<BrowserCheckResult>
}

/**
 * The follow-up guidance both system prompts share, so the "end a finished task
 * with suggest_prompts" instruction lives in one place rather than being copied
 * into the Codebuff prompt, the Claude Code preset append, and the tool descriptions.
 */
export const SUGGEST_PROMPTS_GUIDANCE = `When you finish a task, call the suggest_prompts tool to propose 1–3 high-confidence follow-ups the user is likely to want next — a natural next feature, a polish pass, a test, or a cleanup the work created. Each follow-up parks in the per-thread queue beside the chat, where the user can accept, edit, or ignore it; they do NOT run automatically. Aim to end a finished task with a suggest_prompts call so the user always has a useful handoff ready. Keep them high-signal: give each a concrete, self-contained prompt plus a short label, and only propose things you'd genuinely expect the user to accept. If nothing obvious comes to mind, skip the call — zero good follow-ups beats noisy, speculative, or busywork ones.`

/** A SDK-neutral tool definition: a name, a model-facing description, a Zod raw
 *  shape for the input, optional examples, and an execute body that returns the
 *  JSON payload (each adapter wraps it in that SDK's result envelope). */
export interface ThreadToolSpec {
  name: string
  description: string
  /** Zod raw shape — `z.object(shape)` for Codebuff, passed as-is to `tool()`. */
  shape: z.ZodRawShape
  exampleInputs?: unknown[]
  run: (deps: ThreadToolDeps, args: any) => unknown | Promise<unknown>
}

/** Identity helper that type-checks each spec's `run` body against its own shape
 *  before the spec is widened into the {@link ThreadToolSpec} array. */
function defineThreadTool<S extends z.ZodRawShape>(spec: {
  name: string
  description: string
  shape: S
  exampleInputs?: z.infer<z.ZodObject<S>>[]
  run: (deps: ThreadToolDeps, args: z.infer<z.ZodObject<S>>) => unknown | Promise<unknown>
}): ThreadToolSpec {
  return spec as ThreadToolSpec
}

const suggestPromptsSpec = defineThreadTool({
  name: 'suggest_prompts',
  description:
    'Propose one or more follow-up prompts the user might want to run next in ' +
    'this thread. They appear as suggestions the user can accept, edit, or ignore ' +
    '— they do NOT run automatically. Each needs a concrete prompt; a short label ' +
    'is optional.',
  shape: {
    prompts: z.array(z.object({ prompt: z.string(), label: z.string().optional() })),
  },
  exampleInputs: [
    { prompts: [{ prompt: 'Add tests for the new endpoint', label: 'Test the endpoint' }] },
  ],
  run: (deps, args) => {
    const items = args.prompts.filter((p) => p.prompt.trim())
    deps.onSuggest(items)
    return { ok: true, added: items.length }
  },
})

const writeDocSpec = defineThreadTool({
  name: 'write_doc',
  description:
    'Record durable, generally-useful learnings into a governing doc (product, ' +
    'priorities, technical, learning). Defaults to appending. There is a length ' +
    'cap — if the write exceeds it you must condense and try again.',
  // The enum (the SDK validates against it before `run`) is the single gate on the
  // doc name, derived from DOC_NAMES so it can't drift from the canonical list.
  shape: {
    name: z.enum(DOC_NAMES as readonly [DocName, ...DocName[]]),
    content: z.string(),
    mode: z.enum(['append', 'replace']).optional(),
  },
  exampleInputs: [{ name: 'learning', content: 'The build step requires Bun ≥ 1.3.' }],
  run: (deps, args) => {
    const r = deps.onWriteDoc(args.name, args.content, args.mode ?? 'append')
    return r.ok ? { ok: true } : { error: 'cap', message: r.error }
  },
})

const browserCheckSpec = defineThreadTool({
  name: 'browser_check',
  description:
    "Load this thread's current work in a REAL headless browser and report whether it " +
    'renders without console/page errors. Use this for ANY web UI, page, or game change — ' +
    'it returns the facts you cannot get by reading code (did it load, did it render, what ' +
    'errors appeared). Rendering is not correctness, but errors or a blank render mean it is ' +
    'broken no matter how good the code looks.',
  shape: {},
  exampleInputs: [{}],
  run: (deps) => deps.onBrowserCheck(),
})

/** The full set, in the order tools are presented to the model. */
export const THREAD_TOOL_SPECS: ThreadToolSpec[] = [
  suggestPromptsSpec,
  writeDocSpec,
  browserCheckSpec,
]
