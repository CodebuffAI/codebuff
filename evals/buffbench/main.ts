import path from 'path'

import { runBuffBench } from './run-buffbench'

async function main() {
  // Compare Codebuff agents against external CLI agents
  // Use 'external:claude' for Claude Code CLI
  // Use 'external:codex' for OpenAI Codex CLI
  await runBuffBench({
    evalDataPath: path.join(__dirname, 'eval-codebuff.json'),
    agents: ['base2', 'external:claude', 'external:codex'],
    taskConcurrency: 1,
  })

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running example:', error)
    process.exit(1)
  })
}
