import path from 'path'
import { runGitEvals2 } from './run-git-evals2'

async function main() {
  console.log('Comparing base and base-lite agents on first 3 commits\n')

  const results = await runGitEvals2({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base', 'base-lite'],
    limit: 3,
    onProgress: (event) => {
      if (event.type === 'agent_start') {
        console.log(
          `[${event.agent}] Starting on commit ${event.commit.slice(0, 7)}...`,
        )
      } else if (event.type === 'agent_complete') {
        console.log(
          `[${event.agent}] ✓ Completed with score ${event.score.toFixed(1)}/10`,
        )
      } else if (event.type === 'agent_error') {
        console.log(`[${event.agent}] ✗ Error: ${event.error}`)
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
