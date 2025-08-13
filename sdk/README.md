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

import {
  CodebuffClient,
  generateInitialRunState,
  withAdditionalMessage,
} from '@codebuff/sdk'

// Available after running `codebuff login`
const apiKey = JSON.parse(
  fs
    .readFileSync(os.homedir() + '/.config/manicode/credentials.json')
    .toString(),
).default.authToken
const cwd = process.cwd()

const client = new CodebuffClient({
  apiKey,
  cwd,
  onError: (e) => console.error('Codebuff error:', e.message),
  // Optional: Override the implementation of specific tools.
  overrideTools: {},
})

// Single run
const emptyRun = generateInitialRunState({ cwd })

const runWithExampleImage = withAdditionalMessage({
  runState: emptyRun,
  message: {
    role: 'user',
    content: [
      {
        type: 'image',
        image: new URL(
          'https://upload.wikimedia.org/wikipedia/en/a/a9/Example.jpg',
        ),
      },
    ],
  },
})

const run1 = await client.run({
  agent: 'base',
  prompt: 'What is depicted in the attached image?',
  previousRun: runWithExampleImage,
  handleEvent: (event) => {
    console.log('event from run1:', { event })
  },
})

// Continue same session with follow‑up
const run2 = await client.run({
  agent: 'base',
  prompt: 'What about the text? (ignoring the pictures)',
  previousRun: run1,

  // Stream events (optional)
  handleEvent: (event) => {
    // event includes streamed updates like assistant messages and tool calls
    console.log('event from run2:', event)
  },

  // Custom agents (optional)
  agentDefinitions: [
    {
      id: 'my-awesome-agent',
      model: 'openai/gpt-5',
      displayName: 'My awesome agent',
      instructionsPrompt: 'Do something awesome',
      // ... other AgentDefinition properties
    },
  ],
})

client.closeConnection()
```

## API Reference

### `client.run(options)`

Runs a Codebuff agent with the specified options.

#### Parameters

- **`agent`** (string, required): The agent to run. Use `'base'` for the default agent, or specify a custom agent ID if you made your own agent config.

- **`prompt`** (string, required): The user prompt describing what you want the agent to do.

- **`params`** (object, optional): Additional parameters for the agent. Most agents don't use this, but some custom agents can take a JSON object as input in addition to the user prompt string.

- **`handleEvent`** (function, optional): Callback function that receives every event during execution (assistant messages, tool calls, etc.). This allows you to stream the agent's progress in real-time. We will likely add a token-by-token streaming callback in the future.

- **`previousRun`** (object, optional): JSON state returned from a previous `run()` call. Use this to continue a conversation or session with the agent, maintaining context from previous interactions.

- **`projectFiles`** (object, optional): All the files in your project as a plain JavaScript object. Keys should be the full path from your current directory to each file, and values should be the string contents of the file. Example: `{ "src/index.ts": "console.log('hi')" }`. This helps Codebuff pick good source files for context. Note: This parameter was previously named `allFiles` but has been renamed for clarity.

- **`knowledgeFiles`** (object, optional): Knowledge files to inject into every `run()` call. Uses the same schema as `projectFiles` - keys are file paths and values are file contents. These files are added directly to the agent's context.

- **`agentDefinitions`** (array, optional): Array of custom agent configurations. Each object should satisfy the AgentConfig type.
- **`maxAgentSteps`** (number, optional): Maximum number of steps the agent can take before stopping. Use this as a safety measure in case your agent starts going off the rails. A reasonable number is around 20.

#### Returns

Returns a Promise that resolves to a `RunState` object which can be passed into subsequent runs via the `previousRun` parameter to resume the conversation.

## License

MIT
