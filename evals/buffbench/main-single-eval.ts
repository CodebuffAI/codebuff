import path from 'path'

import { runBuffBench } from './run-buffbench'

async function main() {
  const saveTraces = process.argv.includes('--save-traces')

  await runBuffBench({
    evalDataPaths: [path.join(__dirname, 'eval-codebuff.json')],
    agents: ['base2-free-evals'],
    taskIds: ['server-agent-validation'],
    saveTraces,
  })

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running buffbench:', error)
    process.exit(1)
  })
}
