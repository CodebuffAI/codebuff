import path from 'path'
import { runGitEvals2 } from './run-git-evals2'

async function main() {
  console.log('Running git-evals2 example...')
  console.log('Comparing base and base-lite agents on first 3 commits\n')

  const results = await runGitEvals2({
    evalDataPath: path.join(__dirname, '../git-evals/eval-codebuff2.json'),
    agents: ['base', 'base-lite'],
    outputPath: path.join(__dirname, '../git-evals2/example-results.json'),
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

  console.log('\n=== Final Results ===')
  console.log(`Total duration: ${(results.totalDuration / 1000).toFixed(1)}s\n`)

  for (const [agentId, data] of results.agents) {
    console.log(`${agentId}:`)
    console.log(`  Score: ${data.averageScore.toFixed(2)}/10`)
    console.log(`  Cost: $${data.averageCost.toFixed(4)}`)
    console.log(`  Duration: ${(data.averageDuration / 1000).toFixed(1)}s`)
    console.log(
      `  Success: ${data.runs.filter((r) => !r.error).length}/${data.runs.length}`,
    )
    console.log()
  }
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running example:', error)
    process.exit(1)
  })
}
