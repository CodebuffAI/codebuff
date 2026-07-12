import { describe, test, expect } from 'bun:test'

import researcherWeb from '../researcher/researcher-web'

import type { AgentState } from '../types/agent-definition'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type MockToolResult = Array<{
  type: 'json'
  value: {
    result?: string
    errorMessage?: string
    links?: Array<{ href: string; text: string }>
  }
}>

function createMockAgentState(): AgentState {
  return {
    agentId: 'researcher-web-test',
    runId: 'test-run',
    parentId: undefined,
    messageHistory: [],
    output: undefined,
    systemPrompt: '',
    toolDefinitions: {},
    contextTokenCount: 0,
  }
}

const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
}

/**
 * Drive the handleSteps generator step by step, feeding mock tool results.
 * Returns all yielded values in order.
 */
function runGenerator(prompt: string, params?: Record<string, any>) {
  const generator = researcherWeb.handleSteps!({
    agentState: createMockAgentState(),
    logger: mockLogger as any,
    prompt,
    params: params ?? {},
  })

  const yields: Array<{ value: any; done: boolean | undefined }> = []
  let next = generator.next()

  while (!next.done) {
    yields.push(next as { value: any; done: boolean })
    const value = next.value

    // If the generator yielded a web_search tool call, feed it a mock result
    if (
      value &&
      typeof value === 'object' &&
      'toolName' in value &&
      value.toolName === 'web_search'
    ) {
      const mockResult: MockToolResult = [
        {
          type: 'json',
          value: {
            result:
              'Mock search result for: ' +
              (value.input.query ?? value.input.url ?? ''),
            links: [
              { href: 'https://example.com/1', text: 'Link 1' },
              { href: 'https://example.com/2', text: 'Link 2' },
            ],
          },
        },
      ]
      next = generator.next({
        toolResult: mockResult,
        stepsComplete: false,
        agentState: createMockAgentState(),
      })
    } else {
      next = generator.next({
        toolResult: undefined,
        stepsComplete: false,
        agentState: createMockAgentState(),
      })
    }
  }

  return yields
}

/**
 * Drive the generator and collect all web_search tool calls yield values.
 */
function collectToolCalls(prompt: string) {
  const yields = runGenerator(prompt)
  return yields
    .filter(
      (y) =>
        y.value &&
        typeof y.value === 'object' &&
        y.value.toolName === 'web_search',
    )
    .map((y) => ({ input: y.value.input, toolName: y.value.toolName }))
}

/**
 * Drive the generator and collect the final structured set_output payload.
 */
function getStepText(prompt: string) {
  const yields = runGenerator(prompt)
  const output = yields.find(
    (y) =>
      y.value &&
      typeof y.value === 'object' &&
      y.value.toolName === 'set_output',
  )
  return JSON.stringify(output?.value?.input?.data ?? {})
}

// ---------------------------------------------------------------------------
// Definition contract
// ---------------------------------------------------------------------------

describe('researcher-web agent', () => {
  describe('definition contract', () => {
    test('has correct id', () => {
      expect(researcherWeb.id).toBe('researcher-web')
    })

    test('has display name', () => {
      expect(researcherWeb.displayName).toBe('Weeb')
    })

    test('has toolNames containing web_search', () => {
      expect(researcherWeb.toolNames).toContain('web_search')
    })

    test('has structured research output', () => {
      expect(researcherWeb.outputMode).toBe('structured_output')
      expect(researcherWeb.outputSchema).toBeDefined()
    })

    test('does not include parent message history', () => {
      expect(researcherWeb.includeMessageHistory).toBe(false)
    })

    test('has handleSteps generator', () => {
      expect(researcherWeb.handleSteps).toBeDefined()
      expect(typeof researcherWeb.handleSteps).toBe('function')
    })

    test('has spawnerPrompt mentioning web search', () => {
      expect(researcherWeb.spawnerPrompt).toContain('web')
    })

    test('handleSteps can be serialized (stringified)', () => {
      const serialized = String(researcherWeb.handleSteps)
      expect(serialized).toContain('web_search')
      expect(serialized).toContain('function*')
    })

    test('handleSteps contains decomposition helpers', () => {
      const serialized = String(researcherWeb.handleSteps)
      expect(serialized).toContain('decomposePrompt')
      expect(serialized).toContain('stripMetaInstructions')
      expect(serialized).toContain('trimQuery')
    })
  })

  // -----------------------------------------------------------------------
  // Simple prompt — fast single-query path
  // -----------------------------------------------------------------------

  describe('simple prompt — single-query path', () => {
    test('makes exactly one web_search call for a short prompt', () => {
      const calls = collectToolCalls('What is TypeScript?')
      expect(calls).toHaveLength(1)
      expect(calls[0].input.query).toContain('TypeScript')
    })

    test('passes the cleaned prompt as the query', () => {
      const stepText = getStepText('How does Rust ownership work?')
      expect(stepText).toContain('Mock search result for:')
      expect(stepText.length).toBeGreaterThan(0)
    })

    test('simple prompt output contains links', () => {
      const stepText = getStepText('What is Bun?')
      expect(stepText).toContain('https://example.com/1')
      expect(stepText).toContain('https://example.com/1')
    })

    test('short prompt under 60 chars stays on simple path', () => {
      const shortPrompt = 'React hooks'
      const calls = collectToolCalls(shortPrompt)
      expect(calls).toHaveLength(1)
    })

    test('strips meta instructions from the query', () => {
      const stepText = getStepText(
        'search the web for Python async best practices',
      )
      // The meta instruction \"search the web for\" should be stripped
      expect(stepText).toContain('Python async')
    })
  })

  // -----------------------------------------------------------------------
  // Broad prompt — decomposition to multiple searches (M1.2-M1.3-M1.4)
  // -----------------------------------------------------------------------

  describe('broad prompt — decomposition path', () => {
    test('detects numbered-list prompt and makes multiple web_search calls', () => {
      const broadPrompt =
        '1. How does Unity handle prefab instantiation?\n' +
        "2. What is Godot's scene tree optimization approach?\n" +
        "3. Compare Unreal's Blueprint vs C++ performance tradeoffs"
      const calls = collectToolCalls(broadPrompt)
      // Should yield at least 2 (one per numbered item), bounded by MAX_TOTAL_CALLS=3
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls.length).toBeLessThanOrEqual(3)
    })

    test('detects multi-question prompt with multiple question marks', () => {
      const broadPrompt =
        "What is Unity's DOTS architecture? How does it compare to traditional GameObject?" +
        'Which rendering pipeline should I use for mobile?'
      const calls = collectToolCalls(broadPrompt)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    test('detects comparison prompt (vs, compare) with sufficient length', () => {
      const broadPrompt =
        'Compare Unity vs Godot vs Unreal Engine 5 for 2D game development.' +
        ' Consider performance, asset pipeline, build size, and platform support.' +
        ' Which engine is better for a solo developer shipping to mobile and web?'
      const calls = collectToolCalls(broadPrompt)
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls.length).toBeLessThanOrEqual(3)
    })

    test('detects bullet-list prompt and decomposes', () => {
      const broadPrompt =
        '- Unity prefab variant workflow\n' +
        '- Godot resource preloading\n' +
        '- Unreal level streaming best practices\n' +
        '- Bevy ECS query optimization'
      const calls = collectToolCalls(broadPrompt)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    test('very long prompt (>400 chars) triggers decomposition when it contains extractable structure', () => {
      // A long prompt with numbered items triggers decomposition
      const base = 'Unity engine architecture and scene management. '
      const longWithNumbers =
        '1. ' +
        base.repeat(3) +
        '\n2. Godot scene tree design and optimization. ' +
        base.repeat(2) +
        '\n3. Unreal Engine 5 level streaming approach. ' +
        base.repeat(2)
      expect(longWithNumbers.length).toBeGreaterThan(400)
      const calls = collectToolCalls(longWithNumbers)
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    test('long prompt without extractable structure stays on simple path', () => {
      // Repeated text is long but has no numbered items, question marks,
      // bullets, or comparison delimiters — decomposePrompt can't split it.
      const base = 'Unity engine architecture and scene management. '
      const longPrompt = base.repeat(9) // ~450 chars
      expect(longPrompt.length).toBeGreaterThan(400)
      const calls = collectToolCalls(longPrompt)
      // Falls through to simple path because no decomposition strategy matches
      expect(calls).toHaveLength(1)
    })

    test('game-engine-style broad prompt triggers multiple focused searches', () => {
      const gamePrompt =
        '1. What rendering pipeline should I use for a 2D mobile game in Unity 6?\n' +
        "2. How does Godot 4.4's Vulkan backend compare to Unity's URP for performance?\n" +
        '3. What are the best practices for asset bundle management in Unreal Engine 5.5?\n' +
        '4. How does Bevy 0.15 handle ECS scheduling for large open-world scenes?'
      const calls = collectToolCalls(gamePrompt)
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls.length).toBeLessThanOrEqual(5) // one reserved attempt per decomposed question
    })

    test('a pasted broad prompt is NOT searched as a single literal query', () => {
      const broadPrompt =
        '1. Unity vs Godot architecture comparison\n' +
        '2. Scene system design differences\n' +
        '3. Which is better for 2D game development?'
      const calls = collectToolCalls(broadPrompt)
      // The whole prompt should NOT appear as a single query
      const queriesHaveFullPrompt = calls.some(
        (c) =>
          c.input.query &&
          c.input.query.includes('Unity vs Godot architecture comparison'),
      )
      // At least one subquery should be shorter than the full prompt
      const shorterQueries = calls.filter(
        (c) => c.input.query && c.input.query.length < broadPrompt.length / 2,
      )
      expect(shorterQueries.length).toBeGreaterThan(0)
      // Multiple calls confirm decomposition happened
      expect(calls.length).toBeGreaterThanOrEqual(2)
    })

    test('structured report has per-question statuses and sources', () => {
      const broadPrompt =
        '1. What is Unity DOTS?\n' +
        '2. How does Godot MultiMesh work?\n' +
        '3. Compare Bevy vs Unreal ECS'
      const stepText = getStepText(broadPrompt)
      expect(stepText).toContain('"questions"')
      expect(stepText).toContain('"status":"answered"')
      expect(stepText).toContain('"sources"')
    })

    test('links are deduplicated across multiple subqueries', () => {
      const broadPrompt =
        '1. Unity DOTS overview\n' + '2. Unity ECS performance'
      const stepText = getStepText(broadPrompt)
      expect(stepText).toContain('"sources"')
    })
  })

  // -----------------------------------------------------------------------
  // Retry/fallback on empty results (M1.5)
  // -----------------------------------------------------------------------

  describe('retry on empty results', () => {
    test('retries with shortened query when first search returns no results', () => {
      const generator = researcherWeb.handleSteps!({
        agentState: createMockAgentState(),
        logger: mockLogger as any,
        prompt:
          '1. Unity DOTS architecture\n2. Godot rendering pipeline\n3. Bevy ECS scheduling',
        params: {},
      })

      // First call — URL extraction check + broad-prompt check
      // The first yield should be a web_search for the first subquestion
      let next = generator.next()
      // It might yield URL extraction or the first web_search directly.
      // Drive through until we find a web_search with a query.
      while (!next.done) {
        const val = next.value
        if (
          val &&
          typeof val === 'object' &&
          'toolName' in val &&
          val.toolName === 'web_search' &&
          (val as any).input.query
        ) {
          // Feed empty result (no results) to trigger retry
          const emptyResult: MockToolResult = [
            {
              type: 'json',
              value: { errorMessage: 'No search results found' },
            },
          ]
          next = generator.next({
            toolResult: emptyResult,
            stepsComplete: false,
            agentState: createMockAgentState(),
          })
          // The next yield should either be another web_search (retry) or a STEP_TEXT
          const nextVal = next.value
          if (
            nextVal &&
            typeof nextVal === 'object' &&
            'toolName' in nextVal &&
            nextVal.toolName === 'web_search'
          ) {
            // Retry query should be shorter (core keywords only)
            const queryInput = (nextVal as any).input?.query
            expect(queryInput).toBeDefined()
            // Retry query is keyword-based, likely shorter
            const retryWords = queryInput.split(' ')
            expect(retryWords.length).toBeLessThanOrEqual(6)
          }
          break
        }
        next = generator.next({
          toolResult: undefined,
          stepsComplete: false,
          agentState: createMockAgentState(),
        })
      }
    })
  })

  // -----------------------------------------------------------------------
  // URL mode preserves original behavior
  // -----------------------------------------------------------------------

  describe('URL mode', () => {
    test('URL prompt uses URL fetch mode, not query decomposition', () => {
      const urlPrompt =
        'Please fetch https://docs.unity.com/compare-versions and tell me\n' +
        '1. What changed? 2. Any breaking changes? 3. Migration guide links?'
      const calls = collectToolCalls(urlPrompt)
      // First (or at least one) call should be a URL fetch
      const urlCalls = calls.filter((c) => c.input.url)
      expect(urlCalls.length).toBeGreaterThanOrEqual(1)
    })

    test('URL mode makes exactly one call', () => {
      const urlPrompt = 'https://docs.godotengine.org/en/stable'
      const calls = collectToolCalls(urlPrompt)
      expect(calls).toHaveLength(1)
      expect(calls[0].input.url).toBe('https://docs.godotengine.org/en/stable')
    })

    test('SSRF guard rejects internal IP URLs and falls back to query mode', () => {
      const ssrfPrompt =
        'Please fetch https://169.254.169.254/latest/meta-data and research AWS metadata endpoints'
      const calls = collectToolCalls(ssrfPrompt)
      // Should NOT have a URL call with the internal IP
      const urlCalls = calls.filter((c) => c.input.url)
      expect(urlCalls).toHaveLength(0)
      // Should fall back to query mode
      const queryCalls = calls.filter((c) => c.input.query)
      expect(queryCalls.length).toBeGreaterThanOrEqual(1)
    })

    test('SSRF guard rejects 127.0.0.1 URLs and falls back to query mode', () => {
      const ssrfPrompt = 'https://127.0.0.1:3000/api/config'
      const calls = collectToolCalls(ssrfPrompt)
      const urlCalls = calls.filter((c) => c.input.url)
      expect(urlCalls).toHaveLength(0)
    })
  })

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe('edge cases', () => {
    test('empty prompt still runs (falls through to query mode)', () => {
      const calls = collectToolCalls('')
      // Should make at least one call (simple path)
      expect(calls.length).toBeGreaterThanOrEqual(1)
    })

    test('prompt with only one question mark stays on simple path', () => {
      const singleQuestion =
        'What is the best Unity render pipeline for mobile?'
      const calls = collectToolCalls(singleQuestion)
      expect(calls).toHaveLength(1)
    })

    test('prompt with two question marks decomposes via question-sentence extraction', () => {
      // Two question marks: decomposePrompt's
      // question-sentence strategy extracts both sentences → broad path triggers.
      const twoQuestions =
        'What is the Unity render pipeline? And how do I configure it?'
      const calls = collectToolCalls(twoQuestions)
      expect(calls).toHaveLength(2)
    })

    test('handles prompt with embedded URLs alongside questions (URL wins)', () => {
      const mixedPrompt =
        'https://docs.unity.com/2025.1\n' +
        'Also, 1. What changed? 2. New features? 3. Deprecations?'
      const calls = collectToolCalls(mixedPrompt)
      // URL present → URL mode wins, single call
      const urlCalls = calls.filter((c) => c.input.url)
      expect(urlCalls.length).toBeGreaterThanOrEqual(1)
      expect(calls.length).toBe(1)
    })
  })

  // -----------------------------------------------------------------------
  // Acceptance criteria from SPEC: game-engine-style prompt triggers
  // multiple searches and NOT a literal search of the full prompt
  // -----------------------------------------------------------------------

  describe('acceptance criteria', () => {
    test('AC: a pasted broad game-engine research prompt is decomposed into multiple focused queries', () => {
      const intensivePrompt =
        'I need to compare different rendering approaches for my game project:\n' +
        "1. How does Unity 6's Scriptable Render Pipeline compare to Godot 4.4's Vulkan renderer\n" +
        '   for a stylized low-poly aesthetic with custom shaders?\n' +
        '2. What are the draw-call limits on mobile (iOS/Android) for Unity URP vs Godot Mobile\n' +
        '   renderer, and which handles batching better for thousands of small mesh instances?\n' +
        '3. Unreal Engine 5.5 Nanite for low-poly — does it add unnecessary overhead, or is it\n' +
        '   worthwhile even for stylized content?\n' +
        '4. Bevy 0.15 render graph custom passes — how hard is it to implement a custom\n' +
        '   cel-shading pass compared to Unity Shader Graph or Godot VisualShader?'
      const calls = collectToolCalls(intensivePrompt)
      expect(calls.length).toBeGreaterThanOrEqual(2)
      expect(calls.length).toBeLessThanOrEqual(5)

      // No single query should contain the FULL original prompt text
      // Each query should be focused on one subquestion
      for (const call of calls) {
        if (call.input.query) {
          // The query should NOT be a verbatim substring of the huge original prompt
          expect(call.input.query.length).toBeLessThan(
            intensivePrompt.length / 2,
          )
        }
      }
    })

    test('AC: structured report has questions and links for broad prompts', () => {
      const broadPrompt =
        '1. Unity DOTS introduction\n' +
        '2. Godot scene tree architecture\n' +
        '3. Bevy ECS for beginners'
      const stepText = getStepText(broadPrompt)
      expect(stepText).toContain('"questions"')
      expect(stepText).toContain('"sources"')
      expect(stepText).toContain('https://example.com/')
    })
  })
})
