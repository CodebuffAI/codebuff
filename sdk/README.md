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

2. Set your API key:
   ```bash
   export CODEBUFF_API_KEY="your-api-key"
   ```

## Usage

```typescript
import { CodebuffClient } from '@codebuff/sdk'

const client = new CodebuffClient({
  cwd: process.cwd()
})

// Start a new chat with an agent
await client.runNewChat({
  agent: 'base',
  prompt: 'Add a new function to calculate fibonacci numbers',
  handleEvent: (event) => {
    console.log(event)
  }
})
```

## API Reference

### CodebuffClient

#### Constructor

```typescript
new CodebuffClient({ cwd: string })
```

#### Methods

##### runNewChat(options)

Starts a new chat session with a Codebuff agent.

**Parameters:**
- `agent`: The agent type to use (e.g., 'base', 'base-lite', 'base-max')
- `prompt`: The instruction to send to the agent
- `params`: Optional parameters for the agent
- `handleEvent`: Callback function to handle streaming events

**Returns:** Promise<ChatContext>

## License

MIT
