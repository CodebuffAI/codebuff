# @codebuff/sdk

Official SDK for Codebuff - AI coding agent and framework

## Installation

```bash
npm install @codebuff/sdk
```

## Prerequisites

1. Install the Codebuff CLI globally:

   ```bash
   npm install -g codebuff
   ```

2. Login to `codebuff` to store the API key in your local config:
   ```bash
   codebuff login
   ```

## Usage

```typescript
import * as fs from 'fs'
import * as os from 'os'
import { CodebuffClient } from '@codebuff/sdk'

// Available after running `codebuff login`
const apiKey = JSON.parse(
  fs
    .readFileSync(os.homedir() + '/.config/manicode/credentials.json')
    .toString(),
).default.authToken

const client = new CodebuffClient({
  apiKey,
  cwd: process.cwd(),
  onError: (e) => console.error('Codebuff error:', e.message),
  // Optional: Override the implementation of specific tools.
  overrideTools: {},
})

// Single run
const run1 = await client.run({
  agent: 'base',
  prompt: 'Add console.log("Hello from Codebuff") to src/index.ts',
})

// Continue same session with follow‑up
const run2 = await client.run({
  agent: 'base',
  prompt: 'Create a basic test file for it',
  previousRun: run1,

  // Stream events (optional)
  handleEvent: (event) => {
    // event includes streamed updates like assistant messages and tool calls
    console.log('event:', event)
  },
})
```

## License

MIT
