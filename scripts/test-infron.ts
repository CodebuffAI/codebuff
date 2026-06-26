#!/usr/bin/env bun

/**
 * Live smoke test for the Infron GLM 5.2 integration.
 *
 * Self-contained (no web imports) so it typechecks as part of the scripts
 * package — mirrors scripts/test-fireworks.ts. It hits the live Infron API and
 * asserts the response CONTRACT our handler depends on:
 *   - `cost` / `cost_details` live at the response ROOT (not in `usage`), and
 *   - `usage` carries token counts but NO `cost`.
 * The handler's own request-shaping + cost-extraction logic is unit-tested in
 * web/src/llm-api/__tests__/infron.test.ts.
 *
 * Usage:
 *   bun scripts/test-infron.ts       # needs INFRON_API_KEY (auto-loaded from .env.local)
 */

export {}

const INFRON_BASE_URL = 'https://llm.onerouter.pro/v1'
const MODEL = 'z-ai/glm-5.2'
const PROVIDER_ORDER = ['alibaba/sg', 'alibaba/cn'] // matches the handler pin
const testPrompt = 'Say "hello world" and nothing else.'

function requestBody(stream: boolean) {
  return {
    model: MODEL,
    messages: [{ role: 'user', content: testPrompt }],
    max_tokens: 64,
    stream,
    usage: { include: true },
    provider: { order: PROVIDER_ORDER },
  }
}

let failures = 0
function check(label: string, ok: boolean, detail?: string) {
  console.log(
    `     ${ok ? '✅' : '❌'} ${label}${detail ? ` — ${detail}` : ''}`,
  )
  if (!ok) failures++
}

function assertContract(label: string, obj: any) {
  console.log(`   ${label} contract:`)
  const rootCost = typeof obj?.cost === 'number' ? obj.cost : null
  const discount = obj?.cost_details?.discount_rate
  const usage = obj?.usage ?? {}
  check(
    'cost present at response ROOT',
    rootCost !== null,
    rootCost === null ? 'missing' : `$${rootCost.toFixed(8)}`,
  )
  check(
    'discount applied',
    discount !== undefined,
    discount !== undefined
      ? `discount_rate=${discount}`
      : 'no cost_details.discount_rate',
  )
  check(
    'usage has token counts',
    typeof usage.completion_tokens === 'number',
    `out=${usage.completion_tokens}`,
  )
  check(
    'cost is NOT inside usage (handler reads root)',
    usage.cost === undefined,
  )
}

async function main() {
  const apiKey = process.env.INFRON_API_KEY
  if (!apiKey) {
    console.error('❌ INFRON_API_KEY is not set. Add it to .env.local.')
    process.exit(1)
  }
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  }

  console.log('🛰  Infron Integration Test (GLM 5.2)')
  console.log('='.repeat(50))

  // ── Non-streaming ──
  console.log('\n── Non-streaming ──')
  const t0 = Date.now()
  const res = await fetch(`${INFRON_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody(false)),
  })
  if (!res.ok) {
    console.error(`❌ Infron returned ${res.status}: ${await res.text()}`)
    process.exit(1)
  }
  const data = await res.json()
  console.log(`✅ Response (${Date.now() - t0}ms):`)
  console.log(`   Content: ${data.choices?.[0]?.message?.content ?? '<none>'}`)
  console.log(`   Model: ${data.model}   Upstream provider: ${data.provider}`)
  assertContract('non-stream', data)

  // ── Streaming ──
  console.log('\n── Streaming ──')
  const s0 = Date.now()
  const sres = await fetch(`${INFRON_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody(true)),
  })
  if (!sres.ok) {
    console.error(
      `❌ Infron streaming returned ${sres.status}: ${await sres.text()}`,
    )
    process.exit(1)
  }
  const reader = sres.body?.getReader()
  if (!reader) {
    console.error('❌ No response body reader')
    process.exit(1)
  }
  const decoder = new TextDecoder()
  let content = ''
  let chunkCount = 0
  let finalChunk: any = null
  let buffer = ''
  let done = false
  while (!done) {
    const r = await reader.read()
    done = r.done
    if (done) break
    buffer += decoder.decode(r.value, { stream: true })
    let nl = buffer.indexOf('\n')
    while (nl !== -1) {
      const line = buffer.slice(0, nl)
      buffer = buffer.slice(nl + 1)
      if (line.startsWith('data: ')) {
        const raw = line.slice('data: '.length).trim()
        if (raw && raw !== '[DONE]') {
          try {
            const chunk = JSON.parse(raw)
            chunkCount++
            const delta = chunk.choices?.[0]?.delta
            if (delta?.content) content += delta.content
            if (chunk.usage) finalChunk = chunk
          } catch {
            // skip non-JSON
          }
        }
      }
      nl = buffer.indexOf('\n')
    }
  }
  console.log(
    `✅ Stream response (${Date.now() - s0}ms, ${chunkCount} chunks):`,
  )
  console.log(`   Content: ${content}`)
  if (finalChunk) {
    console.log(`   Upstream provider: ${finalChunk.provider}`)
    assertContract('stream final chunk', finalChunk)
  } else {
    check('usage-bearing final chunk seen', false)
  }

  console.log(
    `\n${failures === 0 ? '✅ All contract checks passed.' : `❌ ${failures} check(s) failed.`}`,
  )
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((err) => {
  console.error('Error:', err)
  process.exit(1)
})
