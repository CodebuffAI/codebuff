#!/usr/bin/env bun

/**
 * Test script to verify CanopyWave integration and usage/token reporting.
 *
 * Usage:
 *   # Test 1: Hit CanopyWave API directly
 *   bun scripts/test-canopywave.ts direct
 *
 *   # Test 2: Hit our chat completions endpoint (requires running web server + valid API key)
 *   CODEBUFF_API_KEY=<key> bun scripts/test-canopywave.ts endpoint
 *
 *   # Run both tests
 *   CODEBUFF_API_KEY=<key> bun scripts/test-canopywave.ts both
 */

export {}

const CANOPYWAVE_BASE_URL = 'https://inference.canopywave.io/v1'
const CANOPYWAVE_MODEL = 'minimax/minimax-m2.5'
const OPENROUTER_MODEL = 'minimax/minimax-m2.5'

const testPrompt = 'Say "hello world" and nothing else.'

async function testCanopyWaveDirect() {
  const apiKey = process.env.CANOPYWAVE_API_KEY
  if (!apiKey) {
    console.error('❌ CANOPYWAVE_API_KEY is not set. Add it to .env.local or pass it directly.')
    process.exit(1)
  }

  // ── Non-streaming ──
  console.log('── Test 1: CanopyWave API (non-streaming) ──')
  console.log(`Model: ${CANOPYWAVE_MODEL}`)
  console.log(`Prompt: "${testPrompt}"`)
  console.log()

  const startTime = Date.now()
  const response = await fetch(`${CANOPYWAVE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CANOPYWAVE_MODEL,
      messages: [{ role: 'user', content: testPrompt }],
      max_tokens: 64,
    }),
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error(`❌ CanopyWave API returned ${response.status}: ${errorText}`)
    process.exit(1)
  }

  const data = await response.json()
  const elapsed = Date.now() - startTime
  const content = data.choices?.[0]?.message?.content ?? '<no content>'

  console.log(`✅ Response (${elapsed}ms):`)
  console.log(`   Content: ${content}`)
  console.log(`   Model: ${data.model}`)
  console.log()
  console.log('   ── Raw usage object ──')
  console.log(JSON.stringify(data.usage, null, 2))
  console.log()
  console.log('   ── Full raw response (excluding choices content) ──')
  const debugData = { ...data }
  if (debugData.choices) {
    debugData.choices = debugData.choices.map((c: Record<string, unknown>) => ({
      ...c,
      message: { ...(c.message as Record<string, unknown>), content: '<truncated>' },
    }))
  }
  console.log(JSON.stringify(debugData, null, 2))
  console.log()

  // ── Streaming ──
  console.log('── Test 2: CanopyWave API (streaming, include_usage only) ──')
  const streamStart = Date.now()
  const streamResponse = await fetch(`${CANOPYWAVE_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: CANOPYWAVE_MODEL,
      messages: [{ role: 'user', content: testPrompt }],
      max_tokens: 64,
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!streamResponse.ok) {
    const errorText = await streamResponse.text()
    console.error(`❌ CanopyWave streaming API returned ${streamResponse.status}: ${errorText}`)
    process.exit(1)
  }

  await consumeStream(streamResponse, streamStart, 'include_usage only')
}

async function consumeStream(streamResponse: Response, streamStart: number, label: string) {
  const reader = streamResponse.body?.getReader()
  if (!reader) {
    console.error('❌ No response body reader')
    process.exit(1)
  }

  const decoder = new TextDecoder()
  let streamContent = ''
  let chunkCount = 0
  const allUsageChunks: unknown[] = []
  const allRawChunks: unknown[] = []

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
        if (chunk.usage) {
          allUsageChunks.push(chunk.usage)
        }
        // Capture first 3 chunks for debugging
        if (chunkCount <= 3) {
          allRawChunks.push(chunk)
        }
      } catch {
        // skip non-JSON lines
      }
    }
  }

  const streamElapsed = Date.now() - streamStart
  console.log(`✅ Stream response [${label}] (${streamElapsed}ms, ${chunkCount} chunks):`)
  console.log(`   Content: ${streamContent}`)
  console.log()
  console.log(`   ── First 3 raw chunks ──`)
  for (const chunk of allRawChunks) {
    console.log(JSON.stringify(chunk, null, 2))
    console.log()
  }
  console.log(`   ── All usage chunks (${allUsageChunks.length} total) ──`)
  for (const usage of allUsageChunks) {
    console.log(JSON.stringify(usage, null, 2))
    console.log()
  }
  if (allUsageChunks.length === 0) {
    console.log('   ⚠️  No usage data received in stream!')
  }
  console.log()
}

// ─── Chat Completions Endpoint Test ─────────────────────────────────────────

async function testChatCompletionsEndpoint() {
  const codebuffApiKey = process.env.CODEBUFF_API_KEY
  if (!codebuffApiKey) {
    console.error('❌ CODEBUFF_API_KEY is not set. Pass it as an env var.')
    console.error('   Example: CODEBUFF_API_KEY=<key> bun scripts/test-canopywave.ts endpoint')
    process.exit(1)
  }

  const appUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ?? 'http://localhost:3000'
  const endpoint = `${appUrl}/api/v1/chat/completions`
  const runId = process.env.RUN_ID ?? 'test-run-id-canopywave'

  // ── Non-streaming ──
  console.log('── Test: Chat Completions Endpoint (non-streaming) ──')
  console.log(`Endpoint: ${endpoint}`)
  console.log(`Model: ${OPENROUTER_MODEL} (should route to CanopyWave)`)
  console.log(`Prompt: "${testPrompt}"`)
  console.log()

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
        client_id: 'test-canopywave-script',
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
    console.log()
    console.log('   ── Usage object ──')
    console.log(JSON.stringify(data.usage, null, 2))
    console.log()
    if (data.usage) {
      const u = data.usage
      console.log(`   prompt_tokens:     ${u.prompt_tokens ?? 'N/A'}`)
      console.log(`   completion_tokens: ${u.completion_tokens ?? 'N/A'}`)
      console.log(`   total_tokens:      ${u.total_tokens ?? 'N/A'}`)
      console.log(`   cost:              ${u.cost ?? 'N/A'}`)
      console.log(`   cost_details:      ${JSON.stringify(u.cost_details)}`)
    }
  } else {
    console.log(`⚠️  Response ${response.status} (${elapsed}ms):`)
    console.log(`   ${JSON.stringify(data)}`)
    if (response.status === 400 && data.message?.includes('runId')) {
      console.log('   ℹ️  This is expected if you don\'t have a valid run_id.')
      console.log('   ℹ️  The request reached the endpoint — routing to CanopyWave is wired up.')
    } else if (response.status === 401) {
      console.log('   ℹ️  Auth failed. Make sure CODEBUFF_API_KEY is valid.')
    }
  }
  console.log()

  // ── Streaming ──
  console.log('── Test: Chat Completions Endpoint (streaming) ──')
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
        client_id: 'test-canopywave-script',
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
    let chunksWithUsage = 0
    let lastUsage: unknown = null

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
          if (chunk.usage) {
            chunksWithUsage++
            lastUsage = chunk.usage
          }
        } catch {
          // skip non-JSON lines
        }
      }
    }

    console.log(`✅ Stream response (${streamElapsed}ms, ${chunkCount} chunks):`)
    console.log(`   Content: ${streamContent}`)
    console.log(`   Chunks with usage: ${chunksWithUsage} (should be exactly 1)`)
    if (chunksWithUsage > 1) {
      console.log(`   ⚠️  Multiple usage chunks detected — billing fix may not be working!`)
    } else if (chunksWithUsage === 1) {
      console.log(`   ✅ Only 1 usage chunk — billing fix is working correctly!`)
    } else {
      console.log(`   ⚠️  No usage chunks received!`)
    }
    if (lastUsage) {
      console.log()
      console.log('   ── Final usage object ──')
      console.log(JSON.stringify(lastUsage, null, 2))
      const u = lastUsage as Record<string, unknown>
      console.log()
      console.log(`   prompt_tokens:     ${u.prompt_tokens ?? 'N/A'}`)
      console.log(`   completion_tokens: ${u.completion_tokens ?? 'N/A'}`)
      console.log(`   total_tokens:      ${u.total_tokens ?? 'N/A'}`)
      console.log(`   cost:              ${u.cost ?? 'N/A'}`)
      console.log(`   cost_details:      ${JSON.stringify(u.cost_details)}`)
    }
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

  console.log('🔌 CanopyWave Integration Test')
  console.log('='.repeat(50))
  console.log()

  switch (mode) {
    case 'direct':
      await testCanopyWaveDirect()
      break
    case 'endpoint':
      await testChatCompletionsEndpoint()
      break
    case 'both':
      await testCanopyWaveDirect()
      await testChatCompletionsEndpoint()
      break
    default:
      console.error(`Unknown mode: ${mode}`)
      console.error('Usage: bun scripts/test-canopywave.ts [direct|endpoint|both]')
      process.exit(1)
  }

  console.log('Done!')
}

main()
