#!/usr/bin/env bun

import { createBuildIdentity } from './build-identity'

// The release launcher asks a staged binary to identify itself before install.
// Handle this before importing the UI so verification cannot depend on
// tree-sitter, terminal setup, authentication, or network availability.
if (process.argv.includes('--print-build-info')) {
  console.log(
    JSON.stringify(
      createBuildIdentity({
        product:
          process.env.CODEBUFF_CLI_BINARY_NAME ??
          (process.env.FREEBUFF_MODE === 'true' ? 'freebuff' : 'codebuff'),
        version: process.env.CODEBUFF_CLI_VERSION ?? 'dev',
        target:
          process.env.CODEBUFF_CLI_TARGET ??
          `${process.platform}-${process.arch}`,
      }),
    ),
  )
} else {
  const { isTerminalCommandBrokerInvocation, serveTerminalCommandBroker } =
    await import('./utils/terminal-command-broker')
  if (isTerminalCommandBrokerInvocation(process.argv)) {
    await serveTerminalCommandBroker()
  } else {
    await import('./index')
  }
}
