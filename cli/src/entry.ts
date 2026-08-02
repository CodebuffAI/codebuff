#!/usr/bin/env bun

import {
  isTerminalCommandBrokerInvocation,
  serveTerminalCommandBroker,
} from './utils/terminal-command-broker'

if (isTerminalCommandBrokerInvocation(process.argv)) {
  await serveTerminalCommandBroker()
} else {
  await import('./index')
}
