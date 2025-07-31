# Agent Template Override System

This system allows users to customize agent behavior by placing override configuration files in their project's `.agents/templates/` directory.

## How It Works

1. **File Detection**: The system automatically detects `.agents/templates/*.json` and `.md` files and loads them into a dedicated `agentTemplates` field in the project file context
2. **Override Processing**: When an agent is spawned, the system checks for matching override files and applies them to the base template
3. **Dynamic Application**: Overrides are applied at runtime, so changes take effect immediately without restarting

## Override File Format

Override files should be JSON files with the following structure:

```json
{
  "override": {
    "type": "CodebuffAI/reviewer",
    "version": "0.1.7",
    "model": "anthropic/claude-sonnet-4",
    "systemPrompt": {
      "type": "append",
      "content": "Additional system instructions"
    },
    "spawnableAgents": {
      "type": "append",
      "content": ["thinker"]
    }
  }
}
```

## Configuration Options

### Basic Properties

- `type`: Agent type identifier (e.g., "CodebuffAI/reviewer" maps to "reviewer")
- `version`: Version identifier (currently informational)
- `model`: Override the model used by the agent

### Prompt Overrides

Each prompt type (`systemPrompt`, `instructionsPrompt`, `stepPrompt`) supports:

- `type`: How to apply the override
  - `"append"`: Add content after the base prompt
  - `"prepend"`: Add content before the base prompt
  - `"replace"`: Replace the entire base prompt
- `content`: Inline content to use
- `path`: Path to external file (relative to the override file)

### Array Overrides

For arrays like `spawnableAgents` and `toolNames`:

- `type`: How to apply the override
  - `"append"`: Add items to the existing array
  - `"replace"`: Replace the entire array
- `content`: String or array of strings to add/replace

## External Files

You can reference external files for prompt content:

```json
{
  "override": {
    "type": "CodebuffAI/reviewer",
    "version": "0.1.7",
    "systemPrompt": {
      "type": "append",
      "path": "./system-prompt.md"
    }
  }
}
```

The path is resolved relative to the override file's directory.

## Example Usage

### Basic Model Override

`.agents/templates/reviewer.json`:

```json
{
  "override": {
    "type": "CodebuffAI/reviewer",
    "version": "0.1.7",
    "model": "anthropic/claude-sonnet-4"
  }
}
```

### System Prompt Enhancement

`.agents/templates/reviewer.json`:

```json
{
  "override": {
    "type": "CodebuffAI/reviewer",
    "version": "0.1.7",
    "systemPrompt": {
      "type": "append",
      "content": "\n\nAdditional instructions: Focus on security vulnerabilities and performance issues."
    }
  }
}
```

### External File Reference

`.agents/templates/reviewer.json`:

```json
{
  "override": {
    "type": "CodebuffAI/reviewer",
    "version": "0.1.7",
    "systemPrompt": {
      "type": "append",
      "path": "./custom-review-instructions.md"
    }
  }
}
```

`.agents/templates/custom-review-instructions.md`:

```markdown
## Custom Review Guidelines

- Check for proper error handling
- Verify input validation
- Look for potential security issues
```

## Implementation Details

- Override processing happens in `backend/src/templates/agent-overrides.ts`
- Integration points are in `backend/src/run-agent-step.ts`
- Files are loaded into `ProjectFileContext.agentTemplates` (separate from knowledge files)
- Agent template files are loaded in `npm-app/src/project-files.ts`
- Path resolution uses `path.posix.join()` for cross-platform compatibility
- Errors are logged but don't break agent execution (graceful fallback to base template)

## Error Handling

The system is designed to be robust:

- Invalid JSON files are logged and ignored
- Missing external files are logged and treated as empty content
- Non-matching agent types are ignored
- Processing errors fall back to the base template

This ensures that agent execution continues even if override files have issues.
