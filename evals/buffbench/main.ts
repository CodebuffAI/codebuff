import path from 'path'
import fs from 'fs'

import { runBuffBench } from './run-buffbench'

async function main() {
  const results = await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base', 'base2'],
    commitConcurrency: 10,
    onProgress: (event) => {
      if (event.type === 'agent_error') {
        console.log(`[${event.agent}] ✗ ${event.evalId} error: ${event.error}`)
      }
    },
  })

  const outputPath = path.join(__dirname, 'results.json')
  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nResults written to ${outputPath}`)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running example:', error)
    process.exit(1)
  })
}
