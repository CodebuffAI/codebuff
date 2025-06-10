const { spawnSync } = require('child_process')

// When infisical runs, it sets this env var. This prevents infinite loops.
// We also check for CODEBUFF_GITHUB_ACTIONS to avoid running this in CI.
if (
  process.env.INFISICAL_RUN ||
  process.env.CODEBUFF_GITHUB_ACTIONS === 'true'
) {
  return
}

// If a key env var is already present, assume they are all loaded.
if (process.env.ANTHROPIC_API_KEY) {
  return
}

console.log('Infisical: Preloading environment variables...')

const [bunExecutable, ...args] = process.argv

// Bun injects the preload script into the arguments. We need to remove it to avoid issues.
const originalArgs = args.filter((arg) => !arg.includes('infisical-preload.js'))

const result = spawnSync(
  'infisical',
  ['run', '--', bunExecutable, ...originalArgs],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
)

if (result.error) {
  console.error(
    "Infisical: Failed to run. Please make sure it's installed and in your PATH."
  )
  throw result.error
}

// Exit the current process with the exit code of the new process.
process.exit(result.status)
