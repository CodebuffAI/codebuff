# Backend Organization Improvement Plan

## Current State Analysis

The backend currently has a flat structure in `src/` with mixed concerns:
- Main entry point and server setup
- WebSocket handling scattered across multiple files
- Tool definitions and handlers mixed together
- LLM integrations in various subdirectories
- Agent system spread across templates and execution logic
- Utility functions mixed with core business logic

## 1. Feature-Based Modularization

### 1.1 Create Feature Directories
```
src/
├── features/
│   ├── websockets/          # All WebSocket-related code
│   │   ├── server.ts
│   │   ├── switchboard.ts
│   │   ├── actions.ts
│   │   ├── middleware.ts
│   │   └── index.ts
│   ├── llm/                 # LLM integrations and APIs
│   │   ├── providers/
│   │   │   ├── openai.ts
│   │   │   ├── anthropic.ts
│   │   │   ├── gemini.ts
│   │   │   └── openrouter.ts
│   │   ├── ai-sdk.ts
│   │   ├── cost-tracking.ts
│   │   └── index.ts
│   ├── agents/              # Agent system
│   │   ├── execution/
│   │   │   ├── run-agent-step.ts
│   │   │   ├── main-prompt.ts
│   │   │   └── loop-main-prompt.ts
│   │   ├── templates/
│   │   │   ├── static/
│   │   │   ├── dynamic/
│   │   │   └── registry.ts
│   │   └── index.ts
│   ├── tools/               # Tool system
│   │   ├── definitions/
│   │   ├── handlers/
│   │   ├── registry.ts
│   │   └── index.ts
│   └── files/               # File operations
│       ├── processing/
│       ├── reading/
│       └── index.ts
```

### 1.2 Benefits
- Clear separation of concerns
- Easier to locate related functionality
- Reduced coupling between features
- Better testability

## 2. Layered Architecture Implementation

### 2.1 Create Service Layers
```
src/
├── api/                     # HTTP API endpoints
│   ├── routes/
│   ├── middleware/
│   └── index.ts
├── services/                # Business logic layer
│   ├── agent-service.ts
│   ├── tool-service.ts
│   ├── file-service.ts
│   ├── llm-service.ts
│   └── websocket-service.ts
├── data/                    # Data access layer
│   ├── repositories/
│   ├── models/
│   └── index.ts
├── core/                    # Core domain logic
│   ├── entities/
│   ├── value-objects/
│   └── index.ts
└── infrastructure/          # External concerns
    ├── database/
    ├── external-apis/
    └── index.ts
```

### 2.2 Dependency Rules
- API layer depends on Services
- Services depend on Data and Core
- Data layer depends on Infrastructure
- Core has no dependencies on other layers

## 3. Consistent Exports and Naming

### 3.1 Barrel Files Strategy
- Add `index.ts` files to each feature directory
- Export only public interfaces
- Use consistent naming conventions

### 3.2 Naming Conventions
```typescript
// Files: kebab-case
agent-service.ts
websocket-handler.ts

// Classes: PascalCase
class AgentService {}
class WebSocketHandler {}

// Functions: camelCase
function executeAgent() {}
function handleWebSocketMessage() {}

// Constants: SCREAMING_SNAKE_CASE
const MAX_AGENT_STEPS = 20
const DEFAULT_MODEL = 'claude-3-5-sonnet'
```

## 4. Dependency Injection Implementation

### 4.1 Create DI Container
```typescript
// src/container.ts
interface Container {
  agentService: AgentService
  toolService: ToolService
  llmService: LLMService
  fileService: FileService
}

function createContainer(): Container {
  const llmService = new LLMService()
  const fileService = new FileService()
  const toolService = new ToolService(fileService)
  const agentService = new AgentService(llmService, toolService)
  
  return {
    agentService,
    toolService,
    llmService,
    fileService,
  }
}
```

### 4.2 Service Interfaces
```typescript
interface IAgentService {
  executeAgent(options: AgentOptions): Promise<AgentResult>
}

interface IToolService {
  executeTool(toolCall: ToolCall): Promise<ToolResult>
}

interface ILLMService {
  generateResponse(messages: Message[]): AsyncGenerator<string>
}
```

## 5. Implementation Steps

### Phase 1: Create New Structure (No Breaking Changes)
1. Create new feature directories
2. Copy existing files to new locations
3. Update imports in new files
4. Add barrel files with exports

### Phase 2: Migrate Core Systems
1. Move WebSocket handling to `features/websockets/`
2. Consolidate LLM providers in `features/llm/`
3. Reorganize agent system in `features/agents/`
4. Restructure tool system in `features/tools/`

### Phase 3: Implement Services Layer
1. Create service interfaces
2. Extract business logic into services
3. Implement dependency injection
4. Update existing code to use services

### Phase 4: Clean Up and Optimize
1. Remove old files
2. Update all imports
3. Add comprehensive tests
4. Update documentation

## 6. Migration Strategy

### 6.1 Gradual Migration
- Keep old structure working during migration
- Use feature flags for new vs old code paths
- Migrate one feature at a time
- Maintain backward compatibility

### 6.2 Testing Strategy
- Add integration tests for each feature
- Test old and new implementations side by side
- Ensure no regression in functionality
- Performance testing for critical paths

## 7. Expected Benefits

### 7.1 Developer Experience
- Faster navigation and file discovery
- Clearer mental model of system architecture
- Easier onboarding for new developers
- Reduced cognitive load

### 7.2 Maintainability
- Easier to add new features
- Better separation of concerns
- Reduced coupling between components
- Improved testability

### 7.3 Performance
- Better tree-shaking in builds
- Clearer dependency graphs
- Easier to identify bottlenecks
- More efficient imports

## 8. Risks and Mitigation

### 8.1 Risks
- Large refactoring may introduce bugs
- Temporary increase in complexity during migration
- Potential merge conflicts with ongoing development

### 8.2 Mitigation
- Comprehensive test coverage before starting
- Gradual migration approach
- Feature flags for rollback capability
- Clear communication with team during migration