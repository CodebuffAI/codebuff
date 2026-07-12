import { spawn } from 'node:child_process'

const command = process.argv[2]
const args = process.argv.slice(3)
if (!command) {
  console.error('Usage: bun scripts/run-mutation-gate.ts <command> [arg...]')
  process.exit(2)
}
const child = spawn(command, args, {
  stdio: 'inherit',
  shell: false,
  env: { ...process.env, OPENBUFF_MUTATION_GATE: '1' },
})
child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
