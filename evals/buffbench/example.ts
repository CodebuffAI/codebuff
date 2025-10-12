import path from 'path'

import { runBuffBench } from './run-buffbench'

async function main() {
  const results = await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base', 'base2'],
    onProgress: (event) => {
      if (event.type === 'agent_error') {
        console.log(`[${event.agent}] ✗ ${event.evalId} error: ${event.error}`)
      }
    },
  })
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running example:', error)
    process.exit(1)
  })
}
