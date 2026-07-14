import fs from 'node:fs'
import { spawn } from 'node:child_process'

type Experiment = {
  taskId: string
  models: string[]
  phases: string[]
  commandTemplate: string[]
}

const file = process.argv[2]
if (!file) {
  console.error(
    'Usage: bun evals/buffbench/run-cross-model-experiment.ts <experiment.json>',
  )
  process.exit(2)
}
const experiment = JSON.parse(fs.readFileSync(file, 'utf8')) as Experiment
const execute = process.argv.includes('--execute')
for (const model of experiment.models) {
  for (const phase of experiment.phases) {
    const command = experiment.commandTemplate.map((part) =>
      part
        .replaceAll('{model}', model)
        .replaceAll('{phase}', phase)
        .replaceAll('{taskId}', experiment.taskId),
    )
    console.log(JSON.stringify({ model, phase, command }))
    if (!execute) continue
    const [program, ...args] = command
    if (!program) throw new Error('commandTemplate must not be empty')
    const exitCode = await new Promise<number>((resolve, reject) => {
      const child = spawn(program, args, { stdio: 'inherit', shell: false })
      child.on('exit', (code) => resolve(code ?? 1))
      child.on('error', reject)
    })
    if (exitCode !== 0) process.exit(exitCode)
  }
}
