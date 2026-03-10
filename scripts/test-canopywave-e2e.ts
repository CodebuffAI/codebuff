#!/usr/bin/env bun

/**
 * E2E test for CanopyWave integration via the Codebuff SDK.
 *
 * Creates a real agent run using the minimax model so the request
 * flows through our chat completions endpoint → CanopyWave → back with usage data.
 *
 * Usage:
 *   bun scripts/test-canopywave-e2e.ts
 */

import { CodebuffClient } from '@codebuff/sdk'

import type { AgentDefinition } from '@codebuff/sdk'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

const minimaxAgent: AgentDefinition = {
  id: 'canopywave-test-agent',
  model: 'minimax/minimax-m2.5',
  displayName: 'CanopyWave Test Agent',
  toolNames: ['end_turn'],
  instructionsPrompt: `You are a test agent. Respond with exactly "Hello from CanopyWave!" and nothing else. Then call the end_turn tool.`,
}

async function main() {
  const apiKey = process.env.CODEBUFF_API_KEY
  if (!apiKey) {
    console.error('❌ CODEBUFF_API_KEY is not set.')
    console.error('   Example: CODEBUFF_API_KEY=<key> bun scripts/test-canopywave-e2e.ts')
    process.exit(1)
  }

  console.log('🔌 CanopyWave E2E Test via Codebuff SDK')
  console.log('='.repeat(50))
  console.log()
  console.log(`Model: ${minimaxAgent.model}`)
  console.log(`Agent: ${minimaxAgent.id}`)
  console.log()

  const client = new CodebuffClient({
    apiKey,
    cwd: process.cwd(),
  })

  const events: PrintModeEvent[] = []
  let responseText = ''

  const startTime = Date.now()

  const result = await client.run({
    agent: minimaxAgent,
    prompt: 'Say hello',
    costMode: 'free',
    handleEvent: (event) => {
      events.push(event)
      if (event.type === 'text') {
        responseText += event.text
        process.stdout.write(event.text)
      } else if (event.type === 'reasoning_delta') {
        // Don't print reasoning, just note it
      } else if (event.type === 'error') {
        console.error(`\n❌ Error event: ${event.message}`)
      } else if (event.type === 'finish') {
        console.log('\n')
      }
    },
    handleStreamChunk: (chunk) => {
      if (typeof chunk === 'string') {
        // Already handled in handleEvent
      }
    },
  })

  const elapsed = Date.now() - startTime

  console.log(`── Results (${elapsed}ms) ──`)
  console.log()

  if (result.output.type === 'error') {
    console.error(`❌ Run failed: ${result.output.message}`)
    if ('statusCode' in result.output) {
      console.error(`   Status code: ${result.output.statusCode}`)
    }
    process.exit(1)
  }

  console.log(`✅ Run succeeded!`)
  console.log(`   Output type: ${result.output.type}`)
  console.log(`   Response text: ${responseText.slice(0, 200)}`)
  console.log()

  // Check session state for credits used
  const creditsUsed = result.sessionState?.mainAgentState.creditsUsed ?? 0
  console.log(`── Credits & Billing ──`)
  console.log(`   Credits used: ${creditsUsed}`)
  console.log(`   Cost (USD): $${(creditsUsed / 100).toFixed(4)}`)
  console.log()

  // Summarize events
  const eventTypes = events.reduce((acc, e) => {
    acc[e.type] = (acc[e.type] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
  console.log(`── Event Summary ──`)
  for (const [type, count] of Object.entries(eventTypes)) {
    console.log(`   ${type}: ${count}`)
  }
  console.log()

  // Check for finish events which include cost info
  const finishEvents = events.filter((e) => e.type === 'finish')
  if (finishEvents.length > 0) {
    console.log(`── Finish Events ──`)
    for (const event of finishEvents) {
      console.log(JSON.stringify(event, null, 2))
    }
    console.log()
  }

  // Print all events for debugging
  console.log(`── All Events (${events.length} total) ──`)
  for (const event of events) {
    if (event.type === 'text' || event.type === 'reasoning_delta') continue
    console.log(JSON.stringify(event))
  }
  console.log()

  console.log('Done!')
}

main().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
