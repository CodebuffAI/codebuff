
Here is a plan to implement the new "research" tool.

### 1. Update Tool Definitions

First, we need to declare the new tool in the central tool definition files.

- **`common/src/constants/tools.ts`**: Add `'research'` to the `toolSchema` object with its parameters. This will also automatically update the `ToolName` type and `TOOL_LIST` array.

```typescript
// common/src/constants/tools.ts
export const toolSchema = {
  // ... other tools
  research: ['prompts'],
  // ... other tools
}
```

- **`backend/src/tools.ts`**: Add the full tool configuration to `toolConfigsList`. This includes the Zod schema for validation and the detailed description that gets shown to the agent.

```typescript
// backend/src/tools.ts
// ... imports

const toolConfigsList = [
  // ... other tools
  {
    name: 'research',
    schema: z.object({
      prompts: z.array(z.string()).describe('An array of research prompts to run in parallel.'),
    }).describe('Run a series of research prompts in parallel to gather information.'),
    additionalInfo: `
This tool allows you to run multiple, independent queries simultaneously to gather information from the codebase or the web. It's useful for complex questions that can be broken down into smaller, parallelizable sub-questions.

Example:
${getToolCallString('research', {
  prompts_0: 'What is the purpose of the `mainPrompt` function?',
  prompts_1: 'Find all usages of the `AgentState` type.',
})}
    `.trim(),
  },
  // ... other tools
] as const;

// ... rest of the file
```

### 2. Create a new `loopMainPrompt` function

In a new file `backend/src/loop-main-prompt.ts`, we'll create a generic `loopMainPrompt` function. This function will repeatedly call `mainPrompt` until the agent's turn ends, which is perfect for our research agents.

```typescript
// backend/src/loop-main-prompt.ts
import { WebSocket } from 'ws'
import { AgentState, ToolResult } from 'common/types/agent-state'
import { ClientAction } from 'common/actions'
import { mainPrompt } from './main-prompt'
import { ClientToolCall } from './tools'

export async function loopMainPrompt(
  ws: WebSocket,
  action: Extract<ClientAction, { type: 'prompt' }>,
  userId: string | undefined,
  clientSessionId: string,
  onResponseChunk: (chunk: string) => void,
  selectedModel: string | undefined
): Promise<{
  agentState: AgentState
  toolCalls: Array<ClientToolCall>
  toolResults: Array<ToolResult>
}> {
  let { agentState, toolResults, toolCalls } = await mainPrompt(
    ws,
    action,
    userId,
    clientSessionId,
    onResponseChunk,
    selectedModel
  );

  // Keep running as long as the agent is using tools and hasn't decided to end the turn.
  while (toolCalls.length > 0 && !toolCalls.some(tc => tc.name === 'end_turn')) {
    const nextAction: Extract<ClientAction, { type: 'prompt' }> = {
        ...action,
        agentState,
        toolResults,
        prompt: '', // No new user prompt, we're in a loop
    };
    const result = await mainPrompt(
        ws,
        nextAction,
        userId,
        clientSessionId,
        onResponseChunk,
        selectedModel
    );
    agentState = result.agentState;
    toolResults = result.toolResults;
    toolCalls = result.toolCalls;
  }

  return { agentState, toolCalls, toolResults };
}
```

### 3. Create the `research` function

Next, we'll create the `research` function in a new file `backend/src/research.ts`. This function will take an array of prompts and run them in parallel using our new `loopMainPrompt`.

```typescript
// backend/src/research.ts
import { WebSocket } from 'ws'
import { AgentState } from 'common/types/agent-state'
import { loopMainPrompt } from './loop-main-prompt'
import { getFilteredToolsInstructions } from './tools'

export async function research(
  ws: WebSocket,
  prompts: string[],
  initialAgentState: AgentState,
  userId: string | undefined,
  clientSessionId: string
) {
  const researchPromises = prompts.map(prompt => {
    // Each research prompt runs in 'lite' mode and can only use read-only tools.
    const researchAgentState: AgentState = {
        ...initialAgentState,
        messageHistory: [], // Start with a clean history for each researcher
    };
    
    const action = {
      type: 'prompt' as const,
      prompt,
      agentState: researchAgentState,
      costMode: 'lite' as const,
      toolResults: [],
      fingerprintId: 'research-fingerprint', // Using a dedicated fingerprint for research tasks
      promptId: `research-${crypto.randomUUID()}`,
      cwd: initialAgentState.fileContext.currentWorkingDirectory,
    };

    return loopMainPrompt(
      ws,
      action,
      userId,
      clientSessionId,
      () => { /* We can ignore chunks for now */ },
      undefined // Use default model for lite mode
    );
  });

  const results = await Promise.all(researchPromises);
  // We'll return the final message history from each research agent.
  return results.map(result => result.agentState.messageHistory);
}
```

### 4. Integrate `research` into `mainPrompt`

We'll update `mainPrompt` in `backend/src/main-prompt.ts` to handle the new `research` tool call.

```typescript
// backend/src/main-prompt.ts

// ... imports
import { research } from './research';
import { generateCompactId } from 'common/util/string';

// ... inside mainPrompt async function, add a new tool callback for research
      research: toolCallback('research', (toolCall) => {
        clientToolCalls.push({
          ...toolCall,
          id: generateCompactId(),
        } as ClientToolCall)
      }),

// ... later in the mainPrompt function, where other tool calls are processed.

    } else if (toolCall.name === 'research') {
      const { prompts } = toolCall.parameters as { prompts: string[] };
      const researchResults = await research(
        ws,
        prompts,
        agentState,
        userId,
        clientSessionId
      );

      // Format results and add to serverToolResults
      const formattedResult = researchResults.map((history, i) => 
        `Research for prompt "${prompts[i]}":\n${history.map(m => m.content).join('\n')}`
      ).join('\n\n');

      serverToolResults.push({
        id: generateCompactId(),
        name: 'research',
        result: formattedResult,
      });
    }
// ... rest of mainPrompt
```

### 5. Add a Tool Renderer in the CLI

To make the output look good in the terminal, we'll add a custom renderer for the `research` tool in `npm-app/src/utils/tool-renderers.ts`.

```typescript
// npm-app/src/utils/tool-renderers.ts

// ... in toolRenderers object
  research: {
    ...defaultToolCallRenderer,
    onParamChunk: (content, paramName, toolName) => {
      // Don't render chunks for prompts, wait for the full list
      return null
    },
    onParamEnd: (paramName, toolName, content) => {
      if (paramName === 'prompts') {
        const prompts = content.trim().split('\n').filter(Boolean);
        return gray(`- ${prompts.join('\n- ')}`);
      }
      return null;
    },
  },
// ...
```

This complete plan now covers both the backend implementation and the frontend rendering for our new `research` tool. Let me know when you're ready to kick things off!
