import { PassThrough } from 'stream'

import { runTerminalCommand } from '../../tools/run-terminal-command'

const controller = new AbortController()
const signals: NodeJS.Signals[] = []
const run = runTerminalCommand({
  command: 'never exits',
  process_type: 'SYNC',
  cwd: process.cwd(),
  timeout_seconds: -1,
  signal: controller.signal,
  terminalCommandBroker: {
    start: () => ({
      pid: 987_654_321,
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      completion: new Promise(() => {}),
      kill: (signal) => signals.push(signal),
      isAlive: () => true,
    }),
  },
})

controller.abort()
await run
console.log(Date.now())

setTimeout(() => {
  if (signals.join(',') !== 'SIGTERM,SIGKILL') process.exitCode = 1
}, 1_600)
