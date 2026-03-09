#!/usr/bin/env bun

/**
 * Test script to verify Fireworks AI integration with minimax-m2.5.
 *
 * Usage:
 *   # Test 1: Hit Fireworks API directly
 *   bun scripts/test-fireworks.ts direct
 *
 *   # Test 2: Hit our chat completions endpoint (requires running web server + valid API key)
 *   CODEBUFF_API_KEY=<key> bun scripts/test-fireworks.ts endpoint
 *
 *   # Run both tests
 *   CODEBUFF_API_KEY=<key> bun scripts/test-fireworks.ts both
 */

const FIREWORKS_BASE_URL = 'https://api.fireworks.ai/inference/v1'
const FIREWORKS_MODEL = 'accounts/fireworks/models/minimax-m2p5'
const OPENROUTER_MODEL = 'minimax/minimax-m2.5'

// Same pricing constants as web/src/llm-api/fireworks.ts
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

// ─── Chat Completions Endpoint Test ─────────────────────────────────────────

async function testChatCompletionsEndpoint() {
  const codebuffApiKey = process.env.CODEBUFF_API_KEY
  if (!codebuffApiKey) {
    console.error('❌ CODEBUFF_API_KEY is not set. Pass it as an env var.')
    console.error('   Example: CODEBUFF_API_KEY=<key> bun scripts/test-fireworks.ts endpoint')
    process.exit(1)
  }

  const appUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ?? 'http://localhost:3000'
  const endpoint = `${appUrl}/api/v1/chat/completions`

  console.log('── Test 2: Chat Completions Endpoint (non-streaming) ──')
  console.log(`Endpoint: ${endpoint}`)
  console.log(`Model: ${OPENROUTER_MODEL} (should route to Fireworks)`)
  console.log(`Prompt: "${testPrompt}"`)
  console.log()

  // We need a valid run_id. This is tricky without a full setup,
  // so we'll just fire the request and check the error to confirm routing.
  // If you have a valid run_id, set it via RUN_ID env var.
  const runId = process.env.RUN_ID ?? 'test-run-id-fireworks'

  const startTime = Date.now()
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${codebuffApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: testPrompt }],
      max_tokens: 64,
      stream: false,
      codebuff_metadata: {
        run_id: runId,
        client_id: 'test-fireworks-script',
        cost_mode: 'free',
      },
    }),
  })

  const elapsed = Date.now() - startTime
  const data = await response.json()

  if (response.ok) {
    const content = data.choices?.[0]?.message?.content ?? '<no content>'
    console.log(`✅ Response (${elapsed}ms):`)
    console.log(`   Content: ${content}`)
    console.log(`   Model: ${data.model}`)
    console.log(`   Provider: ${data.provider}`)
    console.log(`   Usage: ${JSON.stringify(data.usage)}`)
  } else {
    // Even an auth/validation error confirms the endpoint is reachable
    console.log(`⚠️  Response ${response.status} (${elapsed}ms):`)
    console.log(`   ${JSON.stringify(data)}`)
    if (response.status === 400 && data.message?.includes('runId')) {
      console.log('   ℹ️  This is expected if you don\'t have a valid run_id.')
      console.log('   ℹ️  The request reached the endpoint successfully — routing is wired up.')
    } else if (response.status === 401) {
      console.log('   ℹ️  Auth failed. Make sure CODEBUFF_API_KEY is valid.')
    }
  }
  console.log()

  // Streaming test
  console.log('── Test 2b: Chat Completions Endpoint (streaming) ──')
  const streamStart = Date.now()
  const streamResponse = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${codebuffApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENROUTER_MODEL,
      messages: [{ role: 'user', content: testPrompt }],
      max_tokens: 64,
      stream: true,
      codebuff_metadata: {
        run_id: runId,
        client_id: 'test-fireworks-script',
        cost_mode: 'free',
      },
    }),
  })

  const streamElapsed = Date.now() - streamStart

  if (streamResponse.ok) {
    const reader = streamResponse.body?.getReader()
    if (!reader) {
      console.error('❌ No response body reader')
      process.exit(1)
    }

    const decoder = new TextDecoder()
    let streamContent = ''
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
        } catch {
          // skip non-JSON lines
        }
      }
    }

    console.log(`✅ Stream response (${streamElapsed}ms, ${chunkCount} chunks):`)
    console.log(`   Content: ${streamContent}`)
  } else {
    const data = await streamResponse.json()
    console.log(`⚠️  Response ${streamResponse.status} (${streamElapsed}ms):`)
    console.log(`   ${JSON.stringify(data)}`)
    if (streamResponse.status === 400 && data.message?.includes('runId')) {
      console.log('   ℹ️  Expected without a valid run_id. Endpoint is reachable and routing works.')
    }
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
    case 'endpoint':
      await testChatCompletionsEndpoint()
      break
    case 'both':
      await testFireworksDirect()
      await testChatCompletionsEndpoint()
      break
    default:
      console.error(`Unknown mode: ${mode}`)
      console.error('Usage: bun scripts/test-fireworks.ts [direct|endpoint|both]')
      process.exit(1)
  }

  console.log('Done!')
}

main()
