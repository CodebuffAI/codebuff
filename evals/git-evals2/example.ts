import path from 'path'
import { runGitEvals2 } from './run-git-evals2'

async function main() {
  console.log('Comparing base and base-lite agents on first 3 commits\n')

  const results = await runGitEvals2({
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
