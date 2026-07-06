// Runner copy of convex/coding_agent/cli_agent/webcontainerOverrideTools.ts:
// identical delegation protocol (pending_tool_calls rows the user's browser
// tab picks up), with the Convex ActionCtx swapped for the RunnerCtx bridge.

import { internal } from '../../web/convex/_generated/api'
import { asJson } from './harness'

import type { RunnerCtx } from './convexBridge'

const DEFAULT_TOOL_TIMEOUT_MS = 120_000
// How often the runner polls Convex to check if the client completed a tool
// call. The runner has no 10-minute ceiling, so this can be a bit lazier than
// the action's 100ms without hurting turn budgets.
const POLL_INTERVAL_MS = 250

async function waitForToolCallResult(
  ctx: RunnerCtx,
  callId: string,
  timeoutMs: number,
): Promise<unknown> {
  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    const call = await ctx.runQuery<any>(
      internal.codesandbox.pendingToolCalls.getToolCallById,
      { callId },
    )
    if (!call) {
      throw new Error('Tool call disappeared before completion.')
    }
    if (call.status === 'done') {
      return call.output
    }
    if (call.status === 'error') {
      throw new Error(call.error ?? 'Tool call failed in WebContainer.')
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))
  }
  // Mark the row as error so it doesn't stay pending and get re-executed
  // on the next page load or continuation.
  await ctx.runMutation(internal.codesandbox.pendingToolCalls.failToolCall, {
    callId,
    error: 'Timed out waiting for WebContainer tool execution.',
  })
  throw new Error('Timed out waiting for WebContainer tool execution.')
}

async function delegateToolCall(
  ctx: RunnerCtx,
  options: {
    runId: string
    projectId: string
    toolName: string
    input: unknown
    timeoutMs?: number
  },
) {
  const callId = await ctx.runMutation<string>(
    internal.codesandbox.pendingToolCalls.enqueueToolCall,
    {
      runId: options.runId,
      projectId: options.projectId,
      toolName: options.toolName,
      input: options.input,
    },
  )
  const result = await waitForToolCallResult(
    ctx,
    callId,
    options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
  )
  return asJson(result)
}

async function delegateReadFiles(
  ctx: RunnerCtx,
  options: {
    runId: string
    projectId: string
    input: unknown
    timeoutMs?: number
  },
): Promise<Record<string, string | null>> {
  const callId = await ctx.runMutation<string>(
    internal.codesandbox.pendingToolCalls.enqueueToolCall,
    {
      runId: options.runId,
      projectId: options.projectId,
      toolName: 'read_files',
      input: options.input,
    },
  )
  const result = await waitForToolCallResult(
    ctx,
    callId,
    options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS,
  )
  return (result as Record<string, string | null>) ?? {}
}

/**
 * Override tools for Freebuff agent runs on WebContainer-backed projects.
 * Each tool queues a pending call that the user's open browser tab picks up
 * and executes locally inside the WebContainer.
 */
export function buildWebContainerOverrideTools(
  ctx: RunnerCtx,
  options: {
    runId: string
    projectId: string
  },
) {
  const delegate = (toolName: string, input: unknown, timeoutMs?: number) =>
    delegateToolCall(ctx, {
      runId: options.runId,
      projectId: options.projectId,
      toolName,
      input,
      timeoutMs,
    })

  return {
    ask_user: async () =>
      asJson({
        errorMessage: 'Freebuff ask user handling is not available.',
      }),

    read_files: async (input: any) =>
      delegateReadFiles(ctx, {
        runId: options.runId,
        projectId: options.projectId,
        input,
      }),

    write_file: async (input: any) => delegate('write_file', input),

    str_replace: async (input: any) => delegate('str_replace', input),

    apply_patch: async (input: any) => delegate('apply_patch', input),

    run_terminal_command: async (input: any) => {
      // Cap at 3 minutes: long enough for `npx convex dev --once` (codegen +
      // typecheck + push runs in-browser and can exceed 60s).
      const timeoutSeconds = Math.min(Number(input?.timeout_seconds ?? 30), 180)
      return delegate(
        'run_terminal_command',
        input,
        // Small buffer over the client-side kill timeout so the client can
        // report the timed-out result (exit code 124) instead of the server
        // marking the call failed first.
        Math.max(1, timeoutSeconds) * 1000 + 10_000,
      )
    },

    list_directory: async (input: any) => delegate('list_directory', input),

    glob: async (input: any) => delegate('glob', input),

    code_search: async (input: any) => delegate('code_search', input, 30_000),
  }
}
