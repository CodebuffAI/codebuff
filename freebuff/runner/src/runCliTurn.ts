// Codex / Claude Code turn loop on the runner (docs/freebuff-render-harness.md).
// Port of the Convex orchestration in convex/coding_agent/cli_agent/execute.ts
// plus the terminal-state handling from workflow.handleWorkflowComplete:
//   - credential resolution (BYOK decrypt / ChatGPT OAuth state) happens here,
//     with the same env secrets the Convex deployment holds
//   - the executor streams UI-shaped items through the batched delta path
//   - one wall-clock turn limit; no workflow, no cloud chaining
//   - terminal events (final/time_limit_pause/error, agentKind 'cli') finalize
//     the message exactly like handleWorkflowComplete did

import { internal } from '../../web/convex/_generated/api'
import { DaytonaCodebase } from '../../web/codebase-utils/codebase/DaytonaCodebase'
import { initializeCodebase } from '../../web/codebase-utils/codebase/initializeCodebase'
import {
  decryptByokSecret,
  getByokEncryptionSecret,
} from '../../web/convex/coding_agent/cli_agent/byokAuth'
import { createEventBatcher } from './eventBatcher'
import { executeClaudeCode } from './executeClaudeCode'
import { executeCodex } from './executeCodex'

import type { RunnerCtx } from './convexBridge'
import type { ClaimedRun, TurnResult } from './runTurn'

export async function runCliTurn(
  ctx: RunnerCtx,
  claim: ClaimedRun,
  options: {
    turnLimitMs: number
    isCancelled: () => boolean
    shutdown: { requested: boolean }
  },
): Promise<TurnResult> {
  const { runId, projectId, threadId, messageId, payload } = claim
  const agentType = payload.agentType as 'Codex' | 'Claude Code'

  const batcher = createEventBatcher({ ctx, runId, projectId, threadId, messageId })
  const emitStatus = (title: string, content: string) =>
    batcher.append({ type: 'status', title, content })

  const finishCli = async (
    event: { type: 'final' | 'time_limit_pause' | 'error'; message?: string },
  ) => {
    await batcher.finish({ ...event, agentKind: 'cli' })
  }

  const isInterrupted = () => options.isCancelled() || options.shutdown.requested

  try {
    // WebContainer projects have no server-reachable sandbox for CLI agents.
    if (payload.sandboxId.startsWith('webcontainer:')) {
      await finishCli({
        type: 'error',
        message: `${agentType} requires a Daytona sandbox and cannot run on in-browser (WebContainer) projects. Please use the Freebuff agent instead — it runs natively in your browser tab.`,
      })
      return { outcome: 'error' }
    }
    if (!payload.sandboxId.startsWith('daytona:')) {
      await finishCli({
        type: 'error',
        message: 'Project does not have a Daytona sandbox',
      })
      return { outcome: 'error' }
    }

    const executingUser = await ctx.runQuery<any>(internal.users.get, {
      userId: claim.userId,
    })
    if (!executingUser) {
      await finishCli({ type: 'error', message: 'Executing user not found' })
      return { outcome: 'error' }
    }

    // Credit gate — mirrors cliAgentWorkflow. Platform admins, and Codex on
    // ChatGPT OAuth, bypass; everyone else must pass the credit check.
    const executingUserIsPlatformAdmin =
      executingUser.role === 'god' || executingUser.role === 'admin'
    const shouldBypassCreditCheck =
      executingUserIsPlatformAdmin ||
      (agentType === 'Codex' && executingUser.codex_auth_mode === 'chatgpt')
    if (!shouldBypassCreditCheck) {
      const creditCheck = await ctx.runAction<any>(
        internal.coding_agent.cli_agent.creditTracking.checkAgentCredits,
        { projectId, executingUserId: claim.userId },
      )
      if (!creditCheck?.allowed) {
        await finishCli({
          type: 'error',
          message:
            creditCheck?.error ||
            'Insufficient credits. Please add more credits to continue.',
        })
        return { outcome: 'error' }
      }
    }

    emitStatus('Starting VM', 'Connecting to the project runtime.')
    await batcher.flush()

    const codebase = await initializeCodebase(
      payload.sandboxId,
      payload.packageManager,
    )
    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error('Codebase must be DaytonaCodebase for CLI agent execution')
    }

    emitStatus('Preparing agent', `Launching ${agentType}.`)

    // Resume the CLI session the same way the workflow did: read the thread's
    // active session id at execution time (fresh — a shutdown/requeue may have
    // persisted a newer session mid-turn).
    const thread = await ctx.runQuery<any>(
      internal.coding_agent.cli_agent.agent_thread.getAgentThread,
      { threadId },
    )
    const activeSessionId: string | undefined = thread?.active_session_id

    const byokEncryptionSecret = getByokEncryptionSecret()
    const decrypt = (encrypted: string | undefined) =>
      byokEncryptionSecret && encrypted
        ? decryptByokSecret(encrypted, byokEncryptionSecret)
        : undefined

    const emitStreamItem = (item: {
      type: string
      title?: string
      status?: string
      content: string
      description?: string
    }) => batcher.append({ type: 'stream_item', item })

    const shared = {
      projectId: projectId as any,
      threadId: threadId as any,
      messageId: messageId as any,
      sandboxId: payload.sandboxId,
      activeSessionId,
      executingUserId: claim.userId as any,
      userMessage: payload.userMessage,
      images: payload.images as any,
      turnLimitMs: options.turnLimitMs,
      emitStreamItem,
      isInterrupted,
    }

    let result: {
      success: boolean
      error?: string
      sessionId?: string
      timedOut?: boolean
    }

    if (agentType === 'Claude Code') {
      const anthropicApiKey = decrypt(
        executingUser.claude_anthropic_api_key_encrypted,
      )
      const bedrockBearerToken = decrypt(
        executingUser.claude_bedrock_bearer_token_encrypted,
      )
      const claudeProviderPreference =
        executingUser.claude_provider_preference ?? 'bedrock'
      if (claudeProviderPreference === 'anthropic' && !anthropicApiKey) {
        await finishCli({
          type: 'error',
          message:
            'Claude Code is set to Anthropic BYOK, but no Anthropic API key is saved. Configure it in Settings > AI credentials.',
        })
        return { outcome: 'error' }
      }
      if (claudeProviderPreference === 'bedrock' && !bedrockBearerToken) {
        await finishCli({
          type: 'error',
          message:
            'Claude Code is set to AWS Bedrock BYOK, but no Bedrock bearer token is saved. Configure it in Settings > AI credentials.',
        })
        return { outcome: 'error' }
      }
      result = await executeClaudeCode(ctx, codebase, {
        ...shared,
        claudeProviderPreference,
        claudeModelPreference:
          executingUser.claude_model_preference ?? 'default',
        anthropicApiKey,
        bedrockBearerToken,
      })
    } else {
      const openAiApiKey = decrypt(executingUser.gpt_openai_api_key_encrypted)
      const gptAuthMethod = executingUser.gpt_auth_method ?? 'oauth'
      if (gptAuthMethod === 'byok' && !openAiApiKey) {
        await finishCli({
          type: 'error',
          message:
            'Codex is set to OpenAI BYOK, but no OpenAI API key is saved. Configure it in Settings > AI credentials.',
        })
        return { outcome: 'error' }
      }
      if (
        gptAuthMethod === 'oauth' &&
        (executingUser.codex_auth_mode !== 'chatgpt' ||
          executingUser.codex_oauth_revoked === true)
      ) {
        await finishCli({
          type: 'error',
          message:
            'Codex is set to ChatGPT OAuth, but OAuth is not connected. Configure it in Settings > AI credentials.',
        })
        return { outcome: 'error' }
      }
      result = await executeCodex(ctx, codebase, {
        ...shared,
        gptAuthMethod,
        gptModelPreference: executingUser.gpt_model_preference ?? 'default',
        openAiApiKey,
      })
    }

    // User cancel: the cancel mutation already finalized the message
    // (Cancelled) and thread state — just stop quietly.
    if (options.isCancelled()) {
      await batcher.stop()
      return { outcome: 'cancelled' }
    }

    // Runner shutdown: requeue the run. CLI turns resume via the session id
    // already persisted on the thread; re-running the same user message
    // against the resumed session is exactly what cloud chaining does today.
    if (options.shutdown.requested) {
      await batcher.stop()
      return { outcome: 'requeue' }
    }

    // Mirror handleWorkflowComplete's terminal handling.
    if (result.timedOut === true) {
      await finishCli({ type: 'time_limit_pause' })
      return { outcome: 'time_limit_pause' }
    }
    if (result.success) {
      if (result.sessionId) {
        await ctx.runMutation(
          internal.coding_agent.cli_agent.agent_thread
            .updateAgentThreadActiveSessionId,
          { threadId, activeSessionId: result.sessionId, agentType },
        )
      }
      await finishCli({ type: 'final' })
      return { outcome: 'final' }
    }
    await finishCli({
      type: 'error',
      message: result.error || 'Agent run completed with error',
    })
    return { outcome: 'error' }
  } catch (error) {
    if (options.isCancelled()) {
      await batcher.stop()
      return { outcome: 'cancelled' }
    }
    if (options.shutdown.requested) {
      await batcher.stop()
      return { outcome: 'requeue' }
    }
    await finishCli({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unknown error',
    })
    return { outcome: 'error' }
  }
}
