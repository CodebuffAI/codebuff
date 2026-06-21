/**
 * SDK-backed pipeline stage executors (§7). Each stage runs a real coding agent on
 * deepseek-v4-flash (§13) inside the task's git worktree, so it makes real edits to
 * the target repo. Structured outcomes (review pass/fail, test pass/fail) are
 * captured deterministically via per-stage `report_*` custom tools rather than
 * parsed from prose.
 */

import { existsSync } from 'fs'
import { join } from 'path'

import { CodebuffClient, getCustomToolDefinition } from '@codebuff/sdk'
import type { CustomToolDefinition, PrintModeEvent } from '@codebuff/sdk'
import { z } from 'zod/v4'

import type {
  PipelineExecutors,
  ReviewExecutor,
  StageContext,
  StageExecutor,
  StageOutcome,
} from '../../core/pipeline'
import type { Store } from '../../core/store'
import { runBrowserTest, type BrowserTestResult } from '../../core/testers/browser'
import { runInTmux } from '../../core/testers/tmux'
import type { WorktreeManager } from '../../core/worktree'
import { FREEBUFF_MODEL } from '../models'

/** Files in a diff (the `a/<path>` side of each `diff --git` header). */
function changedFiles(diff: string): string[] {
  return [...diff.matchAll(/^diff --git a\/(\S+) b\//gm)].map((m) => m[1])
}
/** A change with no runtime surface — the test stage skips it by judgment (§7). */
function isDocsOnlyDiff(diff: string): boolean {
  const files = changedFiles(diff)
  return (
    files.length > 0 &&
    files.every(
      (f) => /\.(md|markdown|txt)$/i.test(f) || f === 'LICENSE' || f.endsWith('.gitignore'),
    )
  )
}

/** A focused but real coding tool set (mirrors the base coding agent, §11). */
const CODING_TOOLS = [
  'read_files',
  'read_subtree',
  'list_directory',
  'glob',
  'str_replace',
  'write_file',
  'run_terminal_command',
  'set_output',
]

export interface StageAgentDeps {
  client: CodebuffClient
  worktrees: WorktreeManager
  store: Store
  /** Forward agent activity to the engine so the UI can show a live transcript. */
  onAgentEvent?: (taskId: string, stage: string, event: PrintModeEvent) => void
}

function codingAgent(id: string, systemPrompt: string, extraTools: string[] = []) {
  return {
    id,
    displayName: id,
    model: FREEBUFF_MODEL,
    toolNames: [...CODING_TOOLS, ...extraTools],
    systemPrompt,
    instructionsPrompt: 'Work in the current repository. Be concise.',
  }
}

function guidanceBlock(ctx: StageContext): string {
  return ctx.guidance.length
    ? `\n\nAdditional guidance from the user:\n- ${ctx.guidance.join('\n- ')}`
    : ''
}

/**
 * A `report_*` custom tool whose single call's input is captured deterministically
 * (rather than parsed from prose). Returns the tool plus a getter for the captured
 * value — `null` if the agent never called it.
 */
function captureTool<T>(opts: {
  toolName: string
  description: string
  inputSchema: z.ZodType<T>
  exampleInputs: T[]
}): { tool: CustomToolDefinition<string, any, any>; get: () => T | null } {
  let captured: T | null = null
  const tool = getCustomToolDefinition({
    toolName: opts.toolName,
    description: opts.description,
    inputSchema: opts.inputSchema,
    endsAgentStep: true,
    exampleInputs: opts.exampleInputs,
    execute: async (input: T) => {
      captured = input
      return [{ type: 'json', value: { ok: true } }]
    },
  })
  return { tool, get: () => captured }
}

export function buildStageExecutors(deps: StageAgentDeps): PipelineExecutors {
  const { client, worktrees, store } = deps

  const forward = (taskId: string, stage: string) => (event: PrintModeEvent) =>
    deps.onAgentEvent?.(taskId, stage, event)

  async function runCoding(
    ctx: StageContext,
    stage: string,
    agent: ReturnType<typeof codingAgent>,
    prompt: string,
    customToolDefinitions: CustomToolDefinition<string, any, any>[] = [],
  ) {
    const cwd = worktrees.worktreePath(ctx.task.id)
    return client.run({
      agent,
      prompt,
      cwd,
      customToolDefinitions,
      handleEvent: forward(ctx.task.id, stage),
    })
  }

  const implement: StageExecutor = {
    async run(ctx): Promise<StageOutcome> {
      const agent = codingAgent(
        'fb-implement',
        'You are an implementation agent. Implement ONLY what THIS task asks — do ' +
          'not build features, scaffolding, or polish that belong to other tasks, ' +
          'even if it seems convenient; separate agents own those and will run after ' +
          'you. Staying in scope keeps each change small and reviewable, and leaves ' +
          'room for the follow-up tasks. Edit files directly; keep the change focused ' +
          'and working. Do not commit — just leave the edits in the working tree.',
      )
      await runCoding(
        ctx,
        'implement',
        agent,
        `Implement this task.\n\nTitle: ${ctx.task.title}\nDescription:\n${ctx.task.description}${guidanceBlock(ctx)}`,
      )
      return { kind: 'ok' }
    },
  }

  const simplify: StageExecutor = {
    async run(ctx): Promise<StageOutcome> {
      const diff = await worktrees.workingDiff(ctx.task.id)
      if (!diff.trim()) return { kind: 'skipped' }
      const agent = codingAgent(
        'fb-simplify',
        'You are a simplification agent. Make the existing change smaller and ' +
          'cleaner: reuse existing code, delete the unnecessary, improve naming. Do ' +
          'not add features or change behavior. Leave edits in the working tree.',
      )
      await runCoding(
        ctx,
        'simplify',
        agent,
        `Simplify the current uncommitted change without altering its behavior. ` +
          `Current diff vs. the base branch:\n\n\`\`\`diff\n${diff.slice(0, 12000)}\n\`\`\``,
      )
      return { kind: 'ok' }
    },
  }

  const review: ReviewExecutor = {
    async run(ctx) {
      const diff = await worktrees.workingDiff(ctx.task.id)
      if (!diff.trim()) return { kind: 'ok' }
      const { tool: reportReview, get } = captureTool({
        toolName: 'report_review',
        description:
          'Report the review verdict. pass=true if the change is correct and ' +
          'ready; otherwise pass=false with specific, actionable findings.',
        inputSchema: z.object({ pass: z.boolean(), findings: z.string() }),
        exampleInputs: [{ pass: true, findings: '' }],
      })
      const agent = codingAgent(
        'fb-review',
        'You are an ADVERSARIAL code reviewer (§7). Actively try to break the change: ' +
          'trace the actual code paths, look for the way it fails — off-by-one and ' +
          'boundary errors, null/undefined and empty-input handling, async/order-of-' +
          'initialization bugs, state that gets out of sync, resource leaks, and cases ' +
          'the task clearly intends but the code misses. Read the surrounding code, ' +
          'not just the diff. Set pass=false for any genuine correctness or security ' +
          'defect that would produce a wrong result or break the build, with specific ' +
          'actionable findings. Do NOT fail for style, naming, or speculative hardening ' +
          'outside the task’s intent — if it correctly does what the task asked and you ' +
          'could not break it, pass=true. Call report_review exactly once. Do not edit files.',
        ['report_review'],
      )
      await runCoding(
        ctx,
        'review',
        agent,
        `Review this uncommitted change for the task "${ctx.task.title}". Diff vs base:\n\n\`\`\`diff\n${diff.slice(0, 12000)}\n\`\`\`\n\nCall report_review with your verdict.`,
        [reportReview],
      )
      const c = get()
      if (!c) return { kind: 'ok' } // no verdict ⇒ no blocking findings
      store.setArtifact(ctx.task.id, 'reviewNotes', c.findings || 'No findings.')
      return c.pass ? { kind: 'ok' } : { kind: 'needs-fixes', findings: c.findings }
    },

    async fix(ctx, findings) {
      const agent = codingAgent(
        'fb-fixer',
        'You are a fixer agent. Apply the reviewer’s findings by editing files ' +
          'directly. Leave edits in the working tree.',
      )
      await runCoding(
        ctx,
        'review',
        agent,
        `Apply these review findings to the current change:\n\n${findings}`,
      )
    },
  }

  // M1 test stage (§7.1): a planner that picks the right harness per surface —
  // web → a real headless browser, CLI/server → a tmux session, plus the project's
  // own commands. Hard browser evidence (errors / blank render) overrides an
  // over-optimistic agent, so "ready" means actually verified, not verified-looking.
  const test: StageExecutor = {
    async run(ctx): Promise<StageOutcome> {
      const diff = await worktrees.workingDiff(ctx.task.id)
      if (!diff.trim()) return { kind: 'skipped' }

      // Agent-adapted: a docs/config-only change has no runtime surface to test.
      if (isDocsOnlyDiff(diff)) {
        store.setArtifact(ctx.task.id, 'testEvidence', 'Skipped — docs/config-only change, no runtime behavior to verify.')
        return { kind: 'skipped' }
      }

      const cwd = worktrees.worktreePath(ctx.task.id)
      const hasWeb = existsSync(join(cwd, 'index.html'))
      let webResult: BrowserTestResult | null = null

      const webTest = getCustomToolDefinition({
        toolName: 'web_test',
        description:
          'Load the project (index.html) in a REAL headless browser and report ' +
          'whether it actually renders without console/page errors. Returns the ' +
          'facts (loaded, rendered, errors, render detail). Use it for any web UI.',
        inputSchema: z.object({}),
        endsAgentStep: false,
        exampleInputs: [{}],
        execute: async () => {
          webResult = await runBrowserTest(cwd)
          if (webResult.screenshot) store.setArtifact(ctx.task.id, 'testScreenshot', webResult.screenshot)
          return [
            {
              type: 'json',
              value: {
                loaded: webResult.loaded,
                rendered: webResult.rendered,
                renderDetail: webResult.renderDetail,
                consoleErrors: webResult.consoleErrors,
                pageErrors: webResult.pageErrors,
                title: webResult.title,
                harnessError: webResult.harnessError ?? null,
              },
            },
          ]
        },
      })

      const tmuxRun = getCustomToolDefinition({
        toolName: 'tmux_run',
        description:
          'Run shell commands in a REAL tmux terminal session (cwd = project root) ' +
          'and get the captured pane output. Use for CLIs, servers, REPLs, or the ' +
          "project's test/build command. Each command waits ~1s for output.",
        inputSchema: z.object({ commands: z.array(z.string()) }),
        endsAgentStep: false,
        exampleInputs: [{ commands: ['node index.js --help'] }],
        execute: async (input) => {
          const r = await runInTmux(cwd, input.commands.slice(0, 8), { settleMs: 900 })
          return [{ type: 'json', value: { output: r.output.slice(0, 4000), error: r.error ?? null } }]
        },
      })

      const { tool: reportTest, get } = captureTool({
        toolName: 'report_test',
        description:
          'Report the verdict: passed=true only if you actually verified the change ' +
          'works, with a short evidence summary (what harness you used and what you saw).',
        inputSchema: z.object({ passed: z.boolean(), evidence: z.string() }),
        exampleInputs: [{ passed: true, evidence: 'Loaded in a headless browser; rendered, no console errors.' }],
      })

      const testCmd = ctx.project.runConfig.test
      const agent = codingAgent(
        'fb-test',
        'You are a test planner + executor (§7.1). Decide what is worth verifying ' +
          'for THIS change and pick the right harness: for a web UI call web_test ' +
          '(a real browser — the source of truth for "does it render"); for a CLI/ ' +
          'server use tmux_run to exercise it and read the output; run the project ' +
          'test/build command via tmux_run when that is the best evidence. ' +
          'IMPORTANT: rendering is not correctness. For changes with real LOGIC or ' +
          'ALGORITHMS (a game AI, a parser, math, validation, sorting), do not stop ' +
          'at "it renders" — write a tiny throwaway assertion script and run it with ' +
          'tmux_run (e.g. `node -e "..."`) to actually verify the behavior (e.g. that ' +
          'an "unbeatable" AI never loses over many simulated games, that edge cases ' +
          'return the right value). Then call report_test once. Be adversarial and ' +
          'honest — if web_test shows errors/blank render or a logic check fails, it ' +
          'FAILED, no matter how good the diff looks.',
        ['web_test', 'tmux_run', 'report_test'],
      )
      const hint = hasWeb
        ? 'This is a WEB project (index.html present) — start with web_test.'
        : 'This looks like a CLI/non-web project — use tmux_run to exercise it.'
      await runCoding(
        ctx,
        'test',
        agent,
        `Plan and run tests for the task "${ctx.task.title}". ${hint}` +
          (testCmd ? ` The project's test command is \`${testCmd}\`.` : '') +
          `\n\nDiff under test:\n\n\`\`\`diff\n${diff.slice(0, 8000)}\n\`\`\`\n\nThen call report_test.`,
        [webTest, tmuxRun, reportTest],
      )

      // Deterministic gate: trust hard browser evidence over the agent's optimism.
      if (webResult) {
        const r = webResult as BrowserTestResult
        const errs = [...r.pageErrors, ...r.consoleErrors]
        if (!r.harnessError && (!r.loaded || !r.rendered || errs.length > 0)) {
          const reason =
            `Web test failed in a headless browser — ` +
            (!r.rendered ? `nothing rendered (${r.renderDetail}). ` : '') +
            (errs.length ? `errors: ${errs.join(' | ')}` : '')
          store.setArtifact(ctx.task.id, 'testEvidence', reason)
          return { kind: 'blocked', reason }
        }
      }

      const c = get()
      if (!c) {
        const r = webResult as BrowserTestResult | null
        if (r?.rendered) {
          store.setArtifact(ctx.task.id, 'testEvidence', `Rendered cleanly in a headless browser (${r.renderDetail}).`)
        }
        return { kind: 'ok' }
      }
      store.setArtifact(ctx.task.id, 'testEvidence', c.evidence)
      return c.passed
        ? { kind: 'ok' }
        : { kind: 'blocked', reason: `Tests failed: ${c.evidence}` }
    },
  }

  const pr: StageExecutor = {
    async run(ctx): Promise<StageOutcome> {
      const committed = await worktrees.commitAll(
        ctx.task.id,
        `${ctx.task.title}\n\n${ctx.task.description}`,
      )
      const diff = await worktrees.workingDiff(ctx.task.id)
      store.setArtifact(ctx.task.id, 'diff', diff)

      if (!committed && !diff.trim()) {
        return {
          kind: 'blocked',
          reason:
            'No changes were produced — this task\'s work may already be done (e.g. ' +
            'an earlier task covered it). Abandon this task, or use Request changes ' +
            'with specifics if something is still missing.',
        }
      }

      const branch = ctx.task.branch ?? worktrees.branchName(ctx.task.id)
      const body =
        `${ctx.task.description}\n\n— Generated by Freebuff Desktop. ` +
        `Review notes and test evidence are attached in the app.`
      store.setArtifact(ctx.task.id, 'prBody', body)

      if (await worktrees.hasRemote()) {
        const url = await worktrees.pushAndOpenPr(ctx.task.id, branch, {
          title: ctx.task.title,
          body,
        })
        return { kind: 'ok', prUrl: url }
      }
      // Local verification mode: no remote, surface a local PR reference + the diff.
      return { kind: 'ok', prUrl: `local://${branch}` }
    },
  }

  return { implement, simplify, review, test, pr }
}
