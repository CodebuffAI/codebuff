import {
  FREEBUFF_DEFAULT_CONTEXT_WINDOW,
  FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID,
  FREEBUFF_MODEL_CONTEXT_WINDOWS,
} from '@codebuff/common/constants/freebuff-models'
import { describe, test, expect } from 'bun:test'

import baseChat from '../base-chat'
import contextPruner from '../context-pruner'

import type { AgentState } from '../types/agent-definition'

/**
 * base-chat exists to stop freebuff.com/chat threads from wedging: chat_thread
 * .run_state replays the whole conversation every turn, so once it outgrows the
 * model's context window the provider rejects EVERY later message in that
 * thread — including a one-word one — and no retry can ever fix it. These tests
 * pin the pruning budget that prevents that.
 */

function createMockAgentState(contextTokenCount: number): AgentState {
  return {
    agentId: 'test-agent',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [
      { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
      { role: 'assistant', content: [{ type: 'text', text: 'Hi there!' }] },
    ],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount,
  }
}

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/** Runs base-chat's handleSteps the way the runtime does — from its stringified
 *  form, so anything referenced out of scope blows up here rather than in prod
 *  — and returns the first yielded value (the context-pruner spawn). */
function firstPrunerSpawn(model?: string) {
  const handleStepsString = baseChat.handleSteps!.toString()
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const isolatedFunction = new Function(`return (${handleStepsString})`)()
  const generator = isolatedFunction({
    agentState: createMockAgentState(100),
    logger: mockLogger,
    model,
  })
  return generator.next().value as {
    toolName: string
    input: { agent_type: string; params: { maxContextLength: number } }
    includeToolCall?: boolean
  }
}

function budgetFor(model?: string): number {
  return firstPrunerSpawn(model).input.params.maxContextLength
}

describe('base-chat context pruning', () => {
  test('defaults to the direct DeepSeek Flash model', () => {
    expect(baseChat.model).toBe(FREEBUFF_DEEPSEEK_V4_FLASH_MODEL_ID)
  })

  test('spawns context-pruner before the first step', () => {
    const spawn = firstPrunerSpawn('minimax/minimax-m3')

    expect(spawn.toolName).toBe('spawn_agent_inline')
    expect(spawn.input.agent_type).toBe('context-pruner')
    // The pruner is plumbing, not conversation — it must not show up as a tool
    // row in the chat transcript.
    expect(spawn.includeToolCall).toBe(false)
  })

  test('declares context-pruner spawnable', () => {
    expect(baseChat.spawnableAgents).toContain('context-pruner')
  })

  test('handleSteps survives serialization (no out-of-scope references)', () => {
    // The runtime evaluates handleSteps from a string, so a constant or import
    // left outside the function body becomes a ReferenceError at runtime.
    expect(() => firstPrunerSpawn('minimax/minimax-m3')).not.toThrow()
    expect(baseChat.handleSteps!.toString()).toMatch(/^function\*\s*\(/)
  })

  test('keeps stepping until the runtime reports the turn is complete', () => {
    const handleStepsString = baseChat.handleSteps!.toString()
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const isolatedFunction = new Function(`return (${handleStepsString})`)()
    const generator = isolatedFunction({
      agentState: createMockAgentState(100),
      logger: mockLogger,
      model: 'minimax/minimax-m3',
    })

    // Step 1: prune, then STEP.
    expect(generator.next().value.input.agent_type).toBe('context-pruner')
    expect(generator.next({ stepsComplete: false }).value).toBe('STEP')
    // Step 2: prunes again — a multi-step turn (subagent spawns) must not skip
    // pruning on later steps.
    expect(
      generator.next({ stepsComplete: false }).value.input.agent_type,
    ).toBe('context-pruner')
    expect(generator.next({ stepsComplete: false }).value).toBe('STEP')
    // Turn ends when the runtime says so.
    expect(generator.next({ stepsComplete: true }).done).toBe(true)
  })
})

describe('base-chat per-model context budget', () => {
  test('budgets each model well below its real context window', () => {
    for (const [model, window] of Object.entries(
      FREEBUFF_MODEL_CONTEXT_WINDOWS,
    )) {
      const budget = budgetFor(model)
      // contextTokenCount is a local GPT-4o-based estimate, and measurements
      // against the threads that wedged in prod show it can be as low as half
      // the provider's real count. A budget at or above half the window would
      // therefore only trigger after the request was already rejectable.
      expect(budget).toBeLessThan(window * 0.5)
      // But not so aggressive that we summarize a conversation the model could
      // still hold comfortably.
      expect(budget).toBeGreaterThan(window * 0.25)
    }
  })

  test('scales the budget with the window: unmapped (128k) < m3 (512k) < flash (1M)', () => {
    const unmapped = budgetFor('some/model-we-have-never-shipped')
    const m3 = budgetFor('minimax/minimax-m3')
    const flash = budgetFor('deepseek/deepseek-v4-flash')

    expect(unmapped).toBeLessThan(m3)
    expect(m3).toBeLessThan(flash)
  })

  test('falls back to the conservative default for an unknown model', () => {
    // Unknown windows must never be assumed large: guessing high wedges the
    // thread permanently, guessing low only prunes earlier than needed.
    const unknown = budgetFor('some/model-we-have-never-shipped')
    const smallestKnown = Math.min(
      ...Object.values(FREEBUFF_MODEL_CONTEXT_WINDOWS),
    )

    expect(unknown).toBeLessThan(smallestKnown)
    expect(unknown).toBeLessThan(FREEBUFF_DEFAULT_CONTEXT_WINDOW)
  })

  test('falls back to the conservative default when the runtime omits the model', () => {
    expect(budgetFor(undefined)).toBe(
      budgetFor('some/model-we-have-never-shipped'),
    )
  })

  test('inline window table matches the shared catalog', () => {
    // handleSteps is serialized, so it cannot import the shared table and has
    // to inline a copy. This test is the only thing keeping the two in sync.
    // Assert on the derived budget rather than the source text: the build
    // minifies handleSteps (comments stripped, 524_288 -> 524288), so any
    // source-shape assertion would be checking the bundler, not the table.
    const budgetFraction =
      budgetFor('minimax/minimax-m3') /
      FREEBUFF_MODEL_CONTEXT_WINDOWS['minimax/minimax-m3']

    for (const [model, window] of Object.entries(
      FREEBUFF_MODEL_CONTEXT_WINDOWS,
    )) {
      // A model missing from the inline table would silently fall back to the
      // default, giving a ratio nothing like the others — which is exactly the
      // drift we want caught. Compare ratios (not floored products) so the
      // assertion isn't hostage to floating-point rounding.
      expect(budgetFor(model) / window).toBeCloseTo(budgetFraction, 4)
    }

    expect(
      budgetFor('some/model-we-have-never-shipped') /
        FREEBUFF_DEFAULT_CONTEXT_WINDOW,
    ).toBeCloseTo(budgetFraction, 4)
  })

  test('budgets Luna 400k, not the 52k it got while missing from the table', () => {
    // Luna's real window is ~1.05M (every OpenRouter endpoint reports it), so
    // falling through to FREEBUFF_DEFAULT_CONTEXT_WINDOW budgeted a
    // million-token model 131_072 * 0.4 = 52_428. Each summarize rewrites the
    // thread from the front and discards the prompt cache with it, so an
    // under-budget model pays for it in cache misses as well as lost context.
    expect(budgetFor('openai/gpt-5.6-luna')).toBe(400_000)
    expect(budgetFor('openai/gpt-5.6-luna')).toBeGreaterThan(
      budgetFor('some/model-we-have-never-shipped'),
    )
  })
})

describe('base-chat budget vs. the thread that actually wedged', () => {
  // Thread 827b738b, minimax/minimax-m3: 234 messages, 1,008,984 text chars,
  // which MiniMax counted as 524,569 tokens against a 524,287 limit. It failed
  // 21 times over 7 days, including on a 4-character message.
  const WEDGED_CHARS = 1_008_984
  const WEDGED_PROVIDER_TOKENS = 524_569

  // The budget is compared against contextTokenCount, a local GPT-4o-based
  // estimate — not the provider's count. Measured on comparable content the
  // estimator yields between 1.95 chars/token (JSON) and 3.33 (English prose),
  // so the same thread lands somewhere in this range.
  const ESTIMATOR_CHARS_PER_TOKEN = [1.95, 2.11, 2.2, 3.33]

  test('prunes that thread no matter where in the estimator range it lands', () => {
    const budget = budgetFor('minimax/minimax-m3')

    for (const charsPerToken of ESTIMATOR_CHARS_PER_TOKEN) {
      const estimated = WEDGED_CHARS / charsPerToken
      // Pruning must trigger across the whole plausible range. At the most
      // favorable end (English prose, 3.33) the estimate is only ~303k against
      // a real 524k — which is why the budget cannot sit near the window.
      expect(estimated).toBeGreaterThan(budget)
    }
  })

  test('leaves room for the provider undercount the estimator cannot see', () => {
    const budget = budgetFor('minimax/minimax-m3')
    const window = FREEBUFF_MODEL_CONTEXT_WINDOWS['minimax/minimax-m3']

    // Worst observed skew: the estimate reads ~half what the provider charges.
    // Even doubled, the budget must stay inside the window, or we would only
    // prune after the request had already become rejectable.
    expect(budget * 2).toBeLessThanOrEqual(window)
    expect(WEDGED_PROVIDER_TOKENS).toBeGreaterThan(window)
  })
})

describe('base-chat model switch mid-thread', () => {
  // The reported wedge: a thread grown on a big-window model that the user then
  // switches to a smaller-window one. It was first seen switching minimax-m3
  // (512k) to kimi-k2.7-code (256k) — "Range of input length should be
  // [1, 262144]". Kimi was removed from Freebuff on 2026-07-31, so the case is
  // now reproduced with an unmapped model, which takes the deliberately small
  // DEFAULT_CONTEXT_WINDOW (128k) and is therefore an even sharper drop.
  const M3 = 'minimax/minimax-m3'
  const SMALL = 'some/model-we-have-never-shipped'

  test('the budget follows the selected model, not the thread', () => {
    const m3Budget = budgetFor(M3)
    const smallBudget = budgetFor(SMALL)
    const smallWindow = FREEBUFF_DEFAULT_CONTEXT_WINDOW

    // Precondition for the bug. Budgets are in *estimated* tokens, and the
    // estimate can run ~2x under what the provider charges, so a thread filling
    // the m3 budget can genuinely exceed the smaller window once it counts it.
    expect(m3Budget * 2).toBeGreaterThan(smallWindow)
    // Same thread, same accumulated context — but the budget drops with the
    // switch, because the pruner runs BEFORE the step and is sized to the
    // model that step will actually use.
    expect(smallBudget).toBeLessThan(m3Budget)
    expect(smallBudget).toBeLessThan(smallWindow)
  })

  test('the pruner prunes when context exceeds the switched-to budget', () => {
    // End-to-end through the real pruner: an m3-sized thread arriving on the
    // smaller model must actually trigger pruning, not just report a smaller
    // number.
    const kimiBudget = budgetFor(SMALL)
    const overKimiUnderM3 = kimiBudget + 50_000

    expect(overKimiUnderM3).toBeLessThan(budgetFor(M3))

    const prunerSteps = contextPruner.handleSteps!.toString()
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const isolatedPruner = new Function(`return (${prunerSteps})`)()
    const generator = isolatedPruner({
      agentState: createMockAgentState(overKimiUnderM3),
      logger: mockLogger,
      params: { maxContextLength: kimiBudget },
    })

    const yields: any[] = []
    let result = generator.next()
    while (!result.done) {
      yields.push(result.value)
      result = generator.next()
    }

    // Pruning rewrites the history via set_messages.
    expect(yields.some((y) => y?.toolName === 'set_messages')).toBe(true)
  })
})

describe('base-chat pruning triggers', () => {
  test('does not re-summarize an idle chat tab on a prompt-cache miss', () => {
    // Chat tabs sit idle for hours. The pruner's default 5-minute cache-miss
    // trigger would summarize a short conversation after any coffee break,
    // losing context for no reason, so base-chat disables that trigger.
    const spawn = firstPrunerSpawn('minimax/minimax-m3')
    expect(spawn.input.params).toHaveProperty('cacheExpiryMs')
    expect((spawn.input.params as any).cacheExpiryMs).toBeGreaterThanOrEqual(
      60 * 60 * 1000,
    )
  })
})
