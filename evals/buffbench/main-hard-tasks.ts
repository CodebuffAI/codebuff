import path from 'path'

import { runBuffBench } from './run-buffbench'

// Hard tasks (avg score <= 7.5) from all eval sets
const HARD_TASK_IDS = [
  // Codebuff hard tasks (16)
  'spawn-inline-agent',
  'validate-custom-tools',
  'agents-cleanup',
  'migrate-agents',
  'unify-agent-builder',
  'unify-tool-types',
  'restrict-tool-types',
  'fix-agent-steps',
  'sdk-websocket-integration',
  'centralize-placeholders',
  'remove-agent-messaging',
  'update-sdk-types',
  'simplify-tool-result',
  'migrate-agent-validation',
  'new-account-banner',
  'refactor-agent-validation',
  // Manifold hard tasks (9)
  'modernize-bottom-nav',
  'unify-ai-prompts',
  'slim-mcp-endpoints',
  'add-min-bet-filter',
  'update-post-validation',
  'update-native-notifs',
  'free-market-creation',
  'normalize-hyphen-search',
  'add-last-active',
  // Plane hard tasks (13)
  'refactor-table-ui',
  'add-emoji-support',
  'add-tracking-events',
  'update-emoji-suggest',
  'validate-descriptions',
  'fix-table-backspace',
  'add-touch-support',
  'unify-rich-editor',
  'add-image-tools',
  'fix-date-properties',
  'migrate-proxy-config',
  'add-table-handles',
  'update-editor-flagging',
  // Saleor hard tasks (7)
  'add-reference-filters',
  'extend-order-search',
  'add-page-attr-filter',
  'fix-transaction-race',
  'remove-valuenames-support',
  'trace-dataloader-span',
  'honor-price-override',
]

async function main() {
  // Run all hard tasks across all 4 eval sets
  await runBuffBench({
    evalDataPaths: [
      path.join(__dirname, 'eval-codebuff.json'),
      path.join(__dirname, 'eval-manifold.json'),
      path.join(__dirname, 'eval-plane.json'),
      path.join(__dirname, 'eval-saleor.json'),
    ],
    agents: ['base2'],
    taskIds: HARD_TASK_IDS,
    taskConcurrency: 1,
  })

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running hard tasks evaluation:', error)
    process.exit(1)
  })
}
