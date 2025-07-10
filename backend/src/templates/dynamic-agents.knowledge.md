# Dynamic Agent System - Technical Documentation

## Architecture Overview

The dynamic agent system allows users to create custom AI agents by placing JSON configuration files in `.agents/templates/`. The system consists of several key components:

### Core Components

1. **DynamicAgentService** (`dynamic-agent-service.ts`)
   - Centralized loading and validation of dynamic agents
   - Schema conversion from JSON to Zod
   - Error handling and reporting

2. **AgentRegistry** (`agent-registry.ts`) 
   - Combines static and dynamic agents
   - Provides unified lookup interface
   - Manages agent name mappings

3. **Schema Validation** (`common/src/types/dynamic-agent-template.ts`)
   - Zod schema for validating agent templates
   - Type definitions for dynamic agents
   - Spawnable agent validation

## Loading Process

1. **Discovery**: Scan `.agents/templates/` for `*.json` files
2. **Filtering**: Skip files with `override: true` (those modify existing agents)
3. **Validation**: Parse and validate against `DynamicAgentTemplateSchema`
4. **Conversion**: Convert JSON schema to internal Zod format
5. **Integration**: Merge with static agents in registry

## Schema Conversion

Dynamic agents define their parameters using a simple JSON schema:

```json
"promptSchema": {
  "text": { "type": "string", "description": "Input text" },
  "count": { "type": "number", "description": "Number of items" }
}
```

This gets converted to Zod schemas during loading:

```typescript
{
  text: z.string().describe("Input text"),
  count: z.number().describe("Number of items")
}
```

## Path-Based Prompt Loading

Prompt fields (systemPrompt, userInputPrompt, etc.) can now reference external files:

```json
{
  "systemPrompt": {
    "path": ".agents/templates/my-agent-system.md"
  },
  "userInputPrompt": "Direct string content"
}
```

Paths are resolved relative to the project root. This enables:
- Better organization of long prompts
- Easier editing with syntax highlighting
- Version control of prompt changes
- Reusable prompt components

### File Content Resolution

Dynamic agent path resolution is handled by utilities in `backend/src/util/file-resolver`:

- `resolveFileContent()`: Core file reading with path resolution
- `resolvePromptField()`: For dynamic agent templates (string | {path})

Agent overrides use their own resolution logic that works with the pre-populated `fileContext.agentTemplates` cache, ensuring compatibility with the existing override system architecture.

## Error Handling

The system provides detailed validation errors:

- **File-level errors**: JSON parsing, missing required fields
- **Schema errors**: Invalid field types, malformed structure  
- **Reference errors**: Invalid spawnable agents, unknown models
- **Runtime errors**: File system access, permission issues

## Integration Points

### Tool System (`tools.ts`)
- `buildSpawnableAgentsDescription()` includes dynamic agents
- Schema display uses pre-converted Zod schemas
- Graceful fallback for unknown agents

### Agent Spawning (`run-tool.ts`)
- Uses `agentRegistry.getAgentName()` for unified lookups
- Supports both static and dynamic agents
- Proper error handling for missing agents

### Prompt System (`strings.ts`)
- Async initialization to load dynamic agents
- Agent name resolution includes dynamic agents
- Template processing supports custom schemas

## Performance Considerations

- **Lazy Loading**: Agents loaded only when registry is initialized
- **Caching**: Templates cached after first load
- **Schema Pre-conversion**: JSON→Zod conversion done once at load time
- **Error Tolerance**: Invalid agents don't break the entire system

## Development Guidelines

### Adding New Features

1. **Schema Changes**: Update `DynamicAgentTemplateSchema` first
2. **Validation**: Add validation logic to `DynamicAgentService`
3. **Integration**: Update registry and tool system as needed
4. **Documentation**: Update user-facing docs and examples

### Testing Dynamic Agents

1. **Unit Tests**: Test individual components in isolation
2. **Integration Tests**: Test full loading and validation flow
3. **Error Cases**: Verify graceful handling of invalid templates
4. **Performance**: Ensure loading doesn't impact startup time

### Debugging Issues

1. **Check Logs**: Dynamic agent loading is extensively logged
2. **Validation Errors**: Review `getValidationErrors()` output
3. **Schema Issues**: Verify JSON structure matches expected format
4. **File System**: Ensure proper permissions and file locations

## Security Considerations

- **File Access**: Limited to `.agents/templates/` directory
- **Model Restrictions**: Only allowed model prefixes accepted
- **Tool Limitations**: Agents can only use predefined tools
- **Validation**: All input validated against strict schemas

## Future Enhancements

- **Hot Reloading**: Detect file changes and reload agents
- **Agent Marketplace**: Share agents across projects
- **Advanced Schemas**: Support for complex parameter types
- **Visual Editor**: GUI for creating agent templates
- **Analytics**: Track agent usage and performance

## Troubleshooting

### Common Issues

1. **Agent Not Loading**
   - Check `override: false` is set
   - Verify JSON syntax is valid
   - Review validation errors in logs

2. **Schema Errors**
   - Ensure all required fields are present
   - Check field types match expected values
   - Validate spawnable agents exist

3. **Runtime Errors**
   - Verify file permissions
   - Check directory structure
   - Review system logs for details

### Debug Commands

```bash
# Check agent registry status
grep "Agent registry initialized" debug/backend.log

# View validation errors  
grep "validation errors" debug/backend.log

# Monitor agent loading
tail -f debug/backend.log | grep "dynamic agent"
```

## API Reference

### DynamicAgentService

```typescript
class DynamicAgentService {
  async loadAgents(fileContext: ProjectFileContext): Promise<DynamicAgentLoadResult>
  getTemplate(agentType: string): AgentTemplate | undefined
  getAllTemplates(): Record<string, AgentTemplate>
  getValidationErrors(): DynamicAgentValidationError[]
  hasAgent(agentType: string): boolean
  getAgentTypes(): string[]
  isServiceLoaded(): boolean
  reset(): void
}
```

### AgentRegistry

```typescript
class AgentRegistry {
  async initialize(fileContext: ProjectFileContext): Promise<void>
  getAgentName(agentType: string): string | undefined
  getAllAgentNames(): Record<string, string>
  getTemplate(agentType: string): AgentTemplate | undefined
  getAllTemplates(): Record<string, AgentTemplate>
  getValidationErrors(): Array<{ filePath: string; message: string }>
  hasAgent(agentType: string): boolean
  getAvailableTypes(): string[]
  reset(): void
}
```
