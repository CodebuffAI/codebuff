import { spawn } from 'node:child_process'

const command = process.argv[2]
const files = process.argv.slice(3)
if (!command || files.length === 0) {
  console.error('Usage: bun scripts/harness-language-server.ts <command> <file...>')
  process.exit(2)
}

// Opt-in adapter: the user supplies a repository-local diagnostic command.
// File paths are passed as argv, never interpolated into a shell string.
const child = spawn(command, files, { stdio: 'inherit', shell: false })
child.on('exit', (code) => process.exit(code ?? 1))
child.on('error', (error) => {
  console.error(error.message)
  process.exit(1)
})
