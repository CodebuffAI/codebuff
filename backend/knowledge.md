# Backend Knowledge

## Programmatic Agents

The backend now supports simplified programmatic agents that use direct generator functions instead of file-based loading:

### Implementation
- **Types**: `ProgrammaticAgentTemplate` in `templates/types.ts` defines the structure
- **Handler**: Direct generator function instead of file path
- **Execution**: `runProgrammaticAgent()` in `run-programmatic-agent.ts` runs generators directly
- **Integration**: Programmatic agents are registered in `templates/agent-list.ts` alongside LLM agents

### Example
See `templates/agents/example-programmatic.ts` for a simple example that demonstrates:
- Generator function signature: `ProgrammaticAgentFunction`
- Context parameter with prompt and params
- Yielding tool calls (placeholder for future implementation)
- Returning results (string or object)

### Key Simplifications Made
1. **Removed complex file loader** - No more `programmatic-agent-loader.ts`
2. **Removed executor class** - No more `programmatic-agent-executor.ts`  
3. **Direct function calls** - Handlers are now direct generator functions
4. **Simplified integration** - Works seamlessly with existing agent system

### Future Enhancements
- Tool call execution within generators
- More sophisticated orchestration patterns
- Error handling and retry logic
- State management between generator steps

## Agent System Architecture

The agent system supports two types:
- **LLM Agents**: Traditional prompt-based agents using language models
- **Programmatic Agents**: Custom logic using JavaScript/TypeScript generators

Both types integrate through the same tool execution system and can spawn each other as needed.
