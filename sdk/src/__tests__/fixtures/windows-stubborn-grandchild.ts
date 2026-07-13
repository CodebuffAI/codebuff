import { spawn } from 'child_process'
import { writeFileSync } from 'fs'

const pidFile = process.argv[2]
if (!pidFile) throw new Error('PID file path is required')

// A detached grandchild survives if only the Git Bash shell parent is killed.
// The Windows cancellation test verifies that the terminal tool kills the
// complete tree instead.
const grandchild = spawn(
  process.execPath,
  ['-e', 'setInterval(() => {}, 1_000)'],
  {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  },
)
if (!grandchild.pid) throw new Error('Failed to start grandchild')

grandchild.unref()
writeFileSync(
  pidFile,
  JSON.stringify({ parentPid: process.pid, grandchildPid: grandchild.pid }),
)
setInterval(() => {}, 1_000)
