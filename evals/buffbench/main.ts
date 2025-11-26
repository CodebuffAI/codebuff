import path from 'path'

import { runBuffBench } from './run-buffbench'

async function main() {
  await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base2', 'base2-max'],
    taskConcurrency: 3,
  })

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running example:', error)
    process.exit(1)
  })
}
