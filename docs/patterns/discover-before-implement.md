# Discover Before Implement: Find Existing Patterns First

Before implementing ANY new feature, search for existing utilities, constants, and templates in the codebase. Duplicating content that already exists is the most common source of architectural drift.

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

When a command produces system messages (not sending to the AI), the handler returns `{ postUserMessage }` and the command-registry calls `params.sendMessage({ content, agentMode, postUserMessage })`:

```typescript
// In command-registry.ts:
defineCommand({
  name: 'init',
  handler: async (params) => {
    const { postUserMessage } = handleInitializationFlowLocally()
    // Handle streaming/queue state check...
    params.sendMessage({
      content: trimmed,
      agentMode: params.agentMode,
      postUserMessage,  // ← injected into message, NOT setMessages directly
    })
  },
})
```

For commands that only show system messages (no AI response), use `params.setMessages`:
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

## Checklist Before Writing New Code

1. **Is there a constant for this?** Search `common/src/constants/` first
2. **Is there a utility for this path operation?** Check `cli/src/project-files.ts`
3. **Does a template file already exist?** Check `common/src/templates/`
4. **Should I track analytics?** Most user-facing actions should call `trackEvent()`
5. **What is the naming convention?** Look at 2-3 existing similar handlers (e.g., `handleHelpCommand`, `handleUsageCommand`) before naming your function

## Anti-patterns

**DON'T** hardcode template content as string literals:
```typescript
// BAD - duplicates content that exists in common/src/templates/
const TYPES_AGENT_DEFINITION = `export interface AgentDefinition { ... }`
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
