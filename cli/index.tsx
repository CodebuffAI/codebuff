#!/usr/bin/env bun
import React from 'react'
import { render } from 'ink'
import meow from 'meow'
import App from './src/app'

const cli = meow(
  `
	Usage
	  $ my-ink-cli

	Options
		--name  Your name

	Examples
	  $ my-ink-cli --name=Jane
	  Hello, Jane
`,
  {
    importMeta: import.meta,
    flags: {
      name: {
        type: 'string',
      },
    },
  }
)

// Enable raw mode on stdin
process.stdin.setRawMode?.(true)
process.stdin.resume()

render(<App name={cli.flags.name} />, {
  stdin: process.stdin,
})
