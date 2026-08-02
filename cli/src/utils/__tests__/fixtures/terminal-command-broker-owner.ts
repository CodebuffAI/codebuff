import { writeFileSync } from 'fs'

import {
  getActiveTerminalCommandProcesses,
  runTerminalCommand,
} from '@codebuff/sdk'

import { createTerminalCommandBroker } from '../../terminal-command-broker'

const [brokerEntry, childEntry, brokerPidPath, commandPidPath] =
  process.argv.slice(2)
if (!brokerEntry || !childEntry || !brokerPidPath || !commandPidPath) {
  process.exit(2)
}
const shellExecutable = process.execPath.replaceAll('\\', '/')
const shellChildEntry = childEntry.replaceAll('\\', '/')
const shellCommandPidPath = commandPidPath.replaceAll('\\', '/')

const run = runTerminalCommand({
  command: `exec ${JSON.stringify(shellExecutable)} ${JSON.stringify(shellChildEntry)} ${JSON.stringify(shellCommandPidPath)}`,
  process_type: 'SYNC',
  cwd: process.cwd(),
  timeout_seconds: 30,
  terminalCommandBroker: createTerminalCommandBroker({
    invocation: () => ({ executable: process.execPath, args: [brokerEntry] }),
  }),
})

const brokerPid = getActiveTerminalCommandProcesses().at(-1)?.pid
if (!brokerPid) process.exit(3)
writeFileSync(brokerPidPath, String(brokerPid))

await run
