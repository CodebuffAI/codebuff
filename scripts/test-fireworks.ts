#!/usr/bin/env bun

/**
 * Test script to verify Fireworks AI integration with minimax-m2.5.
 *
 * Usage:
 *   # Test 1: Hit Fireworks API directly
 *   bun scripts/test-fireworks.ts direct
 *
 */

export {}

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'
const FIREWORKS_MODEL = 'accounts/fireworks/models/minimax-m2p5'

// Fireworks pricing constants used by this diagnostic script.
const FIREWORKS_INPUT_COST_PER_TOKEN = 0.30 / 1_000_000
const FIREWORKS_CACHED_INPUT_COST_PER_TOKEN = 0.03 / 1_000_000
const FIREWORKS_OUTPUT_COST_PER_TOKEN = 1.20 / 1_000_000

function computeCost(usage: Record<string, unknown>): { cost: number; breakdown: string } {
  const inputTokens = typeof usage.prompt_tokens === 'number' ? usage.prompt_tokens : 0
  const outputTokens = typeof usage.completion_tokens === 'number' ? usage.completion_tokens : 0
  const promptDetails = usage.prompt_tokens_details as Record<string, unknown> | undefined
  const cachedTokens = typeof promptDetails?.cached_tokens === 'number' ? promptDetails.cached_tokens : 0
  const nonCachedInput = Math.max(0, inputTokens - cachedTokens)

  const inputCost = nonCachedInput * FIREWORKS_INPUT_COST_PER_TOKEN
  const cachedCost = cachedTokens * FIREWORKS_CACHED_INPUT_COST_PER_TOKEN
  const outputCost = outputTokens * FIREWORKS_OUTPUT_COST_PER_TOKEN
  const totalCost = inputCost + cachedCost + outputCost

  const breakdown = [
    `${nonCachedInput} input × $0.30/M = $${inputCost.toFixed(8)}`,
    `${cachedTokens} cached × $0.03/M = $${cachedCost.toFixed(8)}`,
    `${outputTokens} output × $1.20/M = $${outputCost.toFixed(8)}`,
    `Total: $${totalCost.toFixed(8)}`,
  ].join('\n         ')

  return { cost: totalCost, breakdown }
}

const testPrompt = 'Say "hello world" and nothing else.'

// ─── Direct Fireworks API Test ──────────────────────────────────────────────

async function testFireworksDirect() {
  const apiKey = process.env.FIREWORKS_API_KEY
  if (!apiKey) {
    console.error('❌ FIREWORKS_API_KEY is not set. Add it to .env.local or pass it directly.')
    process.exit(1)
  }

  console.log('── Test 1: Fireworks API (non-streaming) ──')
  console.log(`Model: ${FIREWORKS_MODEL}`)
  console.log(`Prompt: "${testPrompt}"`)
  console.log()

  const startTime = Date.now()
  const response = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages: [{ role: 'user', content: testPrompt }],
      max_tokens: 64,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ Fireworks API returned ${response.status}: ${errorText}`)
    process.exit(1)
  }

  const data = await response.json()
  const elapsed = Date.now() - startTime
  const content = data.choices?.[0]?.message?.content ?? '<no content>'
  const usage = data.usage ?? {}

  const { cost, breakdown } = computeCost(usage)
  console.log(`✅ Response (${elapsed}ms):`)
  console.log(`   Content: ${content}`)
  console.log(`   Model: ${data.model}`)
  console.log(`   Usage: ${JSON.stringify(usage)}`)
  console.log(`   Computed cost: $${cost.toFixed(8)}`)
  console.log(`         ${breakdown}`)
  console.log()

  // Streaming test
  console.log('── Test 1b: Fireworks API (streaming) ──')
  const streamStart = Date.now()
  const streamResponse = await fetch(`${FIREWORKS_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FIREWORKS_MODEL,
      messages: [{ role: 'user', content: testPrompt }],
      max_tokens: 64,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!streamResponse.ok) {
    const errorText = await streamResponse.text()
    console.error(`❌ Fireworks streaming API returned ${streamResponse.status}: ${errorText}`)
    process.exit(1)
  }

  const reader = streamResponse.body?.getReader()
  if (!reader) {
    console.error('❌ No response body reader')
    process.exit(1)
  }

  const decoder = new TextDecoder()
  let streamContent = ''
  let streamUsage: Record<string, unknown> | null = null
  let chunkCount = 0

  let done = false
  while (!done) {
    const result = await reader.read()
    done = result.done
    if (done) break

    const text = decoder.decode(result.value, { stream: true })
    const lines = text.split('\n').filter((l) => l.startsWith('data: '))

    for (const line of lines) {
      const raw = line.slice('data: '.length)
      if (raw === '[DONE]') continue

      try {
        const chunk = JSON.parse(raw)
        chunkCount++
        const delta = chunk.choices?.[0]?.delta
        if (delta?.content) streamContent += delta.content
        if (delta?.reasoning_content) {
          console.log(`   [reasoning chunk] ${delta.reasoning_content.slice(0, 80)}...`)
        }
        if (chunk.usage) streamUsage = chunk.usage
      } catch {
        // skip non-JSON lines
      }
    }
  }

  const streamElapsed = Date.now() - streamStart
  console.log(`✅ Stream response (${streamElapsed}ms, ${chunkCount} chunks):`)
  console.log(`   Content: ${streamContent}`)
  if (streamUsage) {
    const { cost: streamCost, breakdown: streamBreakdown } = computeCost(streamUsage as Record<string, unknown>)
    console.log(`   Usage: ${JSON.stringify(streamUsage)}`)
    console.log(`   Computed cost: $${streamCost.toFixed(8)}`)
    console.log(`         ${streamBreakdown}`)
  }
  console.log()
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
  const mode = process.argv[2] ?? 'direct'

  console.log('🔥 Fireworks Integration Test')
  console.log('='.repeat(50))
  console.log()

  switch (mode) {
    case 'direct':
      await testFireworksDirect()
      break
    default:
      console.error(`Unknown mode: ${mode}`)
      console.error('Usage: bun scripts/test-fireworks.ts [direct]')
      process.exit(1)
  }

  console.log('Done!')
}

main()
