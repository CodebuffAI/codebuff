# Discover Before Implement: Find Existing Patterns First

Before implementing ANY new feature, search for existing utilities, constants, and templates in the codebase. Duplicating content that already exists is the most common source of architectural drift.

## CRITICAL: Check Test Files First for Expected API Contracts

If a test file already exists for the module you're creating (check `__tests__/` directories), **read it before writing a single line of implementation**. Tests reveal:
- The **exact function name** the codebase expects to export
- The **exact function signature** (arguments and return type)
- The **exact behavior** expected (message format, file creation patterns, etc.)

Example: `cli/src/commands/__tests__/init.test.ts` imports `{ handleInitializationFlowLocally }` from `'../init'`. This means the function MUST be named `handleInitializationFlowLocally`, not `handleInitCommand`.

**Decision tree:**
1. Does `__tests__/[filename].test.ts` exist? → Read it FIRST
2. What does it import? → That's your required export name
3. How does it call the function? → That's your required signature
4. What does it assert? → That's your required behavior

## Key Locations to Check in This Codebase

### Project Root Utilities
- **`cli/src/project-files.ts`** — Use `getProjectRoot()` (NOT `process.cwd()`) to get the user's project directory. `setProjectRoot()` sets it at startup.
- **`cli/src/utils/analytics.ts`** — Use `trackEvent(AnalyticsEvent.X, {...})` to track user actions. Constants are in `common/src/constants/analytics-events.ts`.

### Template Files (DO NOT duplicate as strings)
Template files that users receive when scaffolding live in:
```
common/src/templates/initial-agents-dir/
  types/agent-definition.ts  ← import with Bun text import
  types/tools.ts              ← import with Bun text import
  types/util-types.ts         ← import with Bun text import
  my-custom-agent.ts
  package.json
```

Import them as text (Bun-specific, requires `@ts-expect-error`):
```typescript
// @ts-expect-error - Bun text import attribute not supported by TypeScript
import agentDefinitionSource from '../../../common/src/templates/initial-agents-dir/types/agent-definition' with { type: 'text' }
```

### Named Constants
- **Knowledge file name**: `PRIMARY_KNOWLEDGE_FILE_NAME` from `@codebuff/common/constants/knowledge` — use this, don't hardcode `'knowledge.md'`
- **Brand name**: `IS_FREEBUFF` from `cli/src/utils/constants` → use `const brandName = IS_FREEBUFF ? 'Freebuff' : 'Codebuff'`

## CLI Command Pattern

Commands that scaffold files AND show messages use the `postUserMessage` + `sendMessage` pattern:

```typescript
// In init.ts - the handler returns { postUserMessage }, doesn't call setMessages directly
export function handleInitializationFlowLocally(): { postUserMessage: PostUserMessageFn } {
  const messages: string[] = []
  
  // ... do file operations, push to messages array ...
  
  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    ...messages.map((message) => getSystemMessage(message)),
  ]
  return { postUserMessage }
}

// In command-registry.ts - the command calls sendMessage with postUserMessage
defineCommand({
  name: 'init',
  handler: async (params) => {
    const { postUserMessage } = handleInitializationFlowLocally()
    const trimmed = params.inputValue.trim()
    params.saveToHistory(trimmed)
    clearInput(params)
    // Handle streaming/queue state check...
    params.sendMessage({
      content: trimmed,
      agentMode: params.agentMode,
      postUserMessage,  // ← injected, NOT calling setMessages directly
    })
  },
})
```

For commands that ONLY show system messages (no AI call), use `params.setMessages` directly:
```typescript
params.setMessages((prev) => postUserMessage(prev))
```

## The postUserMessage Contract

Handlers that produce UI messages return this shape (from `cli/src/types/contracts/send-message.ts`):
```typescript
type PostUserMessageFn = (prev: ChatMessage[]) => ChatMessage[]
// Return: { postUserMessage: PostUserMessageFn }
```

Use `getSystemMessage(text)` from `cli/src/utils/message-history.ts` to create each message.

## Idempotent Initialization Pattern

When creating files/directories, check each item individually (not the whole directory at once):

```typescript
// DO - check each file/dir independently, allowing partial init
if (existsSync(knowledgePath)) {
  messages.push(`📋 \`knowledge.md\` already exists.`)
} else {
  writeFileSync(knowledgePath, INITIAL_KNOWLEDGE_FILE)
  messages.push(`✅ Created \`knowledge.md\``)
}

// DON'T - bail out early if parent dir exists
if (existsSync(agentsDir)) {
  return // WRONG: user may be missing sub-items
}
```

## Checklist Before Writing New Code

1. **Does a test file already exist?** Check `__tests__/[filename].test.ts` — read it FIRST for expected function name and signature
2. **Is there a constant for this?** Search `common/src/constants/` first
3. **Is there a utility for this path operation?** Check `cli/src/project-files.ts`
4. **Does a template file already exist?** Check `common/src/templates/`
5. **Should I track analytics?** Most user-facing actions should call `trackEvent()`
6. **What is the naming convention?** Look at 2-3 existing similar handlers before naming your function

## Anti-patterns

**DON'T** ignore existing test files that reveal expected exports:
```typescript
// BAD - test expects handleInitializationFlowLocally but you created:
export async function handleInitCommand(params: RouterParams): Promise<void>
```

**DON'T** hardcode template content as string literals:
```typescript
// BAD - duplicates content that exists in common/src/templates/
const AGENT_DEFINITION_TEMPLATE = `export interface AgentDefinition { ... }`
```

**DO** import from the canonical template location:
```typescript
// GOOD
import agentDefinitionSource from '../../../common/src/templates/initial-agents-dir/types/agent-definition' with { type: 'text' }
```

**DON'T** use `process.cwd()` in CLI commands:
```typescript
// BAD
const projectRoot = process.cwd()
```

**DO** use the project-files utility:
```typescript
// GOOD
import { getProjectRoot } from '../project-files'
const projectRoot = getProjectRoot()
```

**DON'T** add scope-creep files not in the requirements — implement exactly what tests and ground truth specify.
