import path from 'path'

import { runBuffBench } from './run-buffbench'

/**
 * Live Gate G4 run for the durable plan session
 * `.agents/sessions/context-cache-remediation-2026-07-03/`.
 *
 * Runs the full 62-task eval-codebuff.json set with the `base2` agent, with the
 * M10.2 cache-recall eval (minCacheHitRatio=0.5) wired into the eval file.
 * Produces FINAL_RESULTS.json with per-task scores, cache-recall pass/fail,
 * cost, and duration — closing out Gate G4 ("buffbench cache/recall eval meets
 * thresholds") with real live-agent data.
 */
async function main() {
  const saveTraces = process.argv.includes('--save-traces')
  const taskConcurrencyArg = process.argv.find((a) =>
    a.startsWith('--task-concurrency='),
  )
  const taskConcurrency = taskConcurrencyArg
    ? parseInt(taskConcurrencyArg.split('=')[1], 10)
    : 6

  await runBuffBench({
    evalDataPaths: [path.join(__dirname, 'eval-codebuff.json')],
    agents: ['base2'],
    taskConcurrency,
    saveTraces,
  })

  process.exit(0)
}

if (import.meta.main) {
  main().catch((error) => {
    console.error('Error running Gate G4 live buffbench:', error)
    process.exit(1)
  })
}
