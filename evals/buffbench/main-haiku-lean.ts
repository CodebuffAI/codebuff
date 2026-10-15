import { remainingTaskIds } from './main-fast-harness'
import { runBuffBench } from './run-buffbench'

/**
 * Claude Haiku 5.5 as production compacts it (320k) against the lean arm
 * held under 100k prompt tokens (agents/lean-context.ts), paired per task,
 * each arm in its own Freestyle VM. Read the result with
 * `bun run buffbench/haiku-lean-report.ts <logsDir>[,<logsDir>]`.
 *
 *   bun run buffbench/main-haiku-lean.ts 10 --tasks=a,b,c
 *   bun run buffbench/main-haiku-lean.ts 10 --resume=<logsDir>
 *   bun run buffbench/main-haiku-lean.ts 10 --agents=base3-haiku-5-5-lean-evals --tasks=…
 */
const evalDataPath = `${__dirname}/eval-codebuff.json`
const arg = (name: string) =>
  process.argv
    .find((a) => a.startsWith(`--${name}=`))
    ?.slice(name.length + 3)
    .split(',')
    .filter(Boolean)

const AGENTS = arg('agents') ?? [
  'base3-haiku-5-5-evals',
  'base3-haiku-5-5-lean-evals',
]
const resume = arg('resume')
const taskIds = resume
  ? remainingTaskIds({ evalDataPath, agents: AGENTS, logsDirs: resume })
  : arg('tasks')
if (resume) console.log(`Resuming: ${taskIds!.length} task(s) left`)

const results = await runBuffBench({
  sandbox: 'freestyle',
  evalDataPaths: [evalDataPath],
  agents: AGENTS,
  taskIds,
  taskConcurrency: Number(process.argv[2] ?? '5'),
  disableAnalysis: true,
  saveTraces: true,
})
console.log('RUN_DONE', JSON.stringify(results.metadata.logsDirectory))
process.exit(0)
