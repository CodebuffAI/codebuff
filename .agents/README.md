# Codebuff Agents

This directory contains your custom Codebuff agents. Each agent is a TypeScript file that defines an AI agent with specific capabilities and behavior.

## Getting Started

1. **Edit an existing agent**: Start with `my-custom-agent.ts` and modify it for your needs
2. **Check out the examples and types**: See the examples and types directories to draw inspiration and learn what's possible.
3. **Test your agent**: Run `codebuff --agent your-agent-name`
4. **Publish your agent**: Run `codebuff publish your-agent-name`

## File Structure

- `types/` - TypeScript type definitions
- `examples/` - Example agents for reference
- `my-custom-agent.ts` - Your first custom agent (edit this!)
- Add any new agents you wish to the .agents directory

## Agent Basics

Each agent file exports an `AgentDefinition` object with:

- `id`: Unique identifier (lowercase, hyphens only)
- `displayName`: Human-readable name
- `model`: AI model to use (see OpenRouter for options)
- `toolNames`: Tools the agent can use
- `instructionsPrompt`: Instructions for the agent's behavior
- `spawnerPrompt`: When other agents should spawn this one
- `spawnableAgents`: Which agents *this* agent can spawn

## Common Tools

- `read_files` - Read file contents
- `write_file` - Create or modify files
- `str_replace` - Make targeted edits
- `run_terminal_command` - Execute shell commands
- `code_search` - Search for code patterns
- `spawn_agents` - Delegate to other agents
- `end_turn` - Finish the response

See `types/tools.ts` for more information on each tool!

## Need Help?

- Check the type definitions in `types/agent-definition.ts`
- Look at examples in the `examples/` directory
- Join the Codebuff Discord community (https://discord.com/invite/mcWTGjgTj3)

Happy agent building! 🤖