/**
 * Test script for external CLI runners (Claude Code and Codex)
 *
 * Usage:
 *   bun run evals/buffbench/test-external-runners.ts [agent]
 *
 * Examples:
 *   bun run evals/buffbench/test-external-runners.ts claude
 *   bun run evals/buffbench/test-external-runners.ts codex
 *   bun run evals/buffbench/test-external-runners.ts both
 */

import path from 'path'

import { runBuffBench } from './run-buffbench'

const SIMPLE_TASK_ID = 'add-sidebar-fades'

async function main() {
  const agentArg = process.argv[2] || 'claude'

  let agents: string[]

  switch (agentArg) {
    case 'claude':
      agents = ['external:claude']
      break
    case 'codex':
      agents = ['external:codex']
      break
    case 'both':
      agents = ['external:claude', 'external:codex']
      break
    case 'compare':
      // Compare codebuff against external agents
      agents = ['base2-fast', 'external:claude']
      break
    default:
      console.error(`Unknown agent: ${agentArg}`)
      console.log('Usage: bun run test-external-runners.ts [claude|codex|both|compare]')
      process.exit(1)
  }

  console.log('\n=== Testing External Runners ===')
  console.log('Agents: ' + agents.join(', '))
  console.log('Task: ' + SIMPLE_TASK_ID + '\n')

  await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents,
    taskIds: [SIMPLE_TASK_ID],
    taskConcurrency: 1, // Run sequentially for clearer output
  })

  console.log('\n=== Test Complete ===')
  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error testing external runners:', error)
    process.exit(1)
  })
}
