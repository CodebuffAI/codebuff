/**
 * Codebuff harness: runs a thread turn through the hosted Codebuff agent framework
 * (DeepSeek v4 Flash) via the SDK client. This is the original code path, lifted
 * out of ThreadEngine.runTurn behind the {@link AgentHarness} interface so the
 * engine can swap in other agents (e.g. Claude Code) without changing its turn
 * bookkeeping.
 */

import type { CodebuffClient, RunState } from '@codebuff/sdk'

import { buildThreadTools, threadAgentDefinition, THREAD_AGENT_TOOLS } from './thread-agent'
import type { AgentHarness, HarnessCallbacks, HarnessResult, HarnessTurn } from './harness'

export class CodebuffHarness implements AgentHarness {
  readonly id = 'codebuff' as const

  constructor(private readonly client: CodebuffClient) {}

  async runTurn(turn: HarnessTurn, cb: HarnessCallbacks): Promise<HarnessResult> {
    const tools = buildThreadTools(turn.toolDeps)
    const toolNames = [...THREAD_AGENT_TOOLS, ...tools.map((t) => t.toolName)]

    // The SDK emits prose both as per-token stream chunks (handleStreamChunk) and
    // as consolidated whole-segment `text` events (handleEvent). Stream when we can
    // and fall back to the consolidated copy only when nothing streamed, so the
    // transcript never double-renders.
    let streamedText = false

    // Attached images go as multimodal message content so the model (MiniMax M3)
    // can actually see them. The SDK combines `prompt` (text) with these image parts
    // (see buildUserMessageContent). No images → omit `content` (prompt-only).
    const content = turn.images?.length
      ? turn.images.map((im) => ({ type: 'image' as const, image: im.image, mediaType: im.mediaType }))
      : undefined

    const run = await this.client.run({
      agent: threadAgentDefinition(toolNames),
      prompt: turn.prompt,
      content,
      cwd: turn.cwd,
      signal: turn.abort.signal,
      previousRun: turn.previousState as RunState | undefined,
      customToolDefinitions: tools,
      drainSteeringMessages: cb.drainSteering,
      handleStreamChunk: (chunk: unknown) => {
        if (typeof chunk === 'string') {
          if (!chunk) return
          streamedText = true
          cb.onText(chunk)
          return
        }
        const c = chunk as { type?: string; chunk?: string }
        if (c?.type === 'reasoning_chunk' && c.chunk) cb.onReasoning(c.chunk)
      },
      handleEvent: (event: any) => {
        if (event.type === 'text') {
          if (!streamedText) cb.onText(event.text)
          return
        }
        cb.onEvent(event)
      },
    })

    return { state: run }
  }
}
