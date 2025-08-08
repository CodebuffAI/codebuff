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

import { WebSocketHandler, getInitialSessionState } from '@codebuff/sdk'

const client = new WebSocketHandler({
  onWebsocketError: (error) => {
    console.log({ error }, 'onWebsocketError')
  },
  onWebsocketReconnect: () => {
    console.log('onWebsocketReconnect')
  },
  onResponseError: async (error) => {
    console.log({ error }, 'onResponseError')
  },
  onRequestReconnect: async () => {
    console.log('onRequestReconnect')
  },
  readFiles: async (input) => {
    console.log({ input }, 'readFiles')
    return {}
  },
  handleToolCall: async ({
    type,
    toolName,
    requestId,
    userInputId,
    args,
    timeout,
  }) => {
    console.log(
      { type, toolName, requestId, userInputId, args, timeout },
      'handleToolCall',
    )
    return { success: true, toolCallResult: 'asdf' }
  },
  onCostResponse: async (action) => {
    console.log({ action }, 'onCostResponse')
  },
  onUsageResponse: async (action) => {
    console.log({ action }, 'onUsageResponse')
  },
  onResponseChunk: async (action) => {
    console.log({ action }, 'onResponseChunk')
  },
  onSubagentResponseChunk: async (action) => {
    console.log({ action }, 'onSubagentResponseChunk')
  },
  onPromptResponse: async (response) => {
    console.log({ response }, 'onPromptResponse')
  },
  // Available after running `codebuff login`
  apiKey: JSON.parse(
    fs
      .readFileSync(os.homedir() + '/.config/manicode/credentials.json')
      .toString(),
  ).default.authToken,
})

console.log('connecting')
await client.connect()
console.log('connected')
client.sendInput({
  prompt: 'can you run echo "hi" for me?',
  promptId: 'some-prompt-id-12345',
  costMode: 'normal',
  sessionState: getInitialSessionState({
    projectRoot: os.homedir() + '/github/codebuff',
    cwd: os.homedir() + '/github/codebuff',
    fileTree: [],
    fileTokenScores: {},
    tokenCallers: {},
    knowledgeFiles: {},
    userKnowledgeFiles: {},
    agentTemplates: {},
    gitChanges: {
      status: '',
      diff: '',
      diffCached: '',
      lastCommitMessages: '',
    },
    changesSinceLastChat: {},
    shellConfigFiles: {},
    systemInfo: {
      platform: process.platform,
      shell: 'bash',
      nodeVersion: process.version,
      arch: process.arch,
      homedir: os.homedir() + '/github/codebuff',
      cpus: 16,
    },
  }),
  toolResults: [],
})
```

## License

MIT
