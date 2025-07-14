# Backend Knowledge

## Architecture

The backend follows a **feature-based modular architecture** organized under `backend/src/features/`:

### Core Features

- **`features/agents/`** - Agent system (execution, templates, registry)
  - `execution/` - Agent execution logic (main-prompt, run-agent-step, loop-main-prompt)
  - `templates/static/` - Static agent templates and registry
- **`features/tools/`** - Tool system (definitions, handlers, constants)
  - `definitions/` - Tool schema definitions
  - `handlers/` - Tool execution handlers
- **`features/llm/`** - LLM providers and integrations
  - `providers/` - Different LLM provider implementations
- **`features/websockets/`** - WebSocket handling and communication
- **`features/files/`** - File processing operations

### Services Layer

- **`services/`** - Business logic layer with dependency injection
  - `agent-service.ts`, `tool-service.ts`, `llm-service.ts`, `file-service.ts`
  - `container.ts` - Dependency injection container
  - `interfaces.ts` - Service interface definitions

This architecture provides:
- Clear separation of concerns
- Better maintainability and testability
- Easier navigation and file discovery
- Reduced coupling between components

## Key Implementation Files

### Root-Level Support Files
- **`prompt-agent-stream.ts`** - Handles LLM streaming for agents
- **`run-programmatic-agent.ts`** - Executes programmatic agents using generators
- **`xml-stream-parser.ts`** - Parses XML tool calls from streams
- **`tools.ts`** - Tool parsing and context management utilities
- **`get-file-reading-updates.ts`** - Manages file reading and updates

## Common Issues and Solutions

### TypeScript and Zod
- Tool definitions use `z.AnyZodObject` but this can cause type issues
- Solution: Use `any` type for parameters in CodebuffToolDef to avoid Zod internal property mismatches
- Make generic types explicit (e.g., `ClientToolCall<T extends ToolName = ToolName>`)

### File Context
- `ProjectFileContext.fileTree` is already flattened, not a nested tree
- `getLastReadFilePaths` requires two parameters: flattened nodes and count

### Variable Scoping
- Avoid reusing variable names in different scopes (e.g., `result` in generators)
- Use descriptive names like `toolResult`, `generatorResult` to prevent conflicts

### Missing Modules
- Some providers like `context7-api` may need stub implementations
- Create minimal implementations that return empty/null results with appropriate logging

## Testing
- Run `bun test` for unit tests
- Run `bun run typecheck` to check TypeScript errors
- File change hooks automatically run tests and typecheck on save

## Debugging Tips
- Check `debug/` directory for process logs
- Use `logger` from `util/logger.ts` for consistent logging
- Enable DEBUG_MODE in `util/debug.ts` for verbose logging
