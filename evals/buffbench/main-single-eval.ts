// Set CI=true to skip Stripe billing during evals
process.env.CI = 'true'

import path from 'path'

import { runBuffBench } from './run-buffbench'

async function main() {
  await runBuffBench({
    evalDataPaths: [path.join(__dirname, 'eval-codebuff.json')],
    agents: ['base2'],
    taskIds: ['filter-system-history'],
  })

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running buffbench:', error)
    process.exit(1)
  })
}
