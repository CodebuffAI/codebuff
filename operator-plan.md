# Operator Agent Plan (Revised)

## Overview

Create a new package `operator` that enables Codebuff to improve itself by running the `npm-app` CLI as a child process. The operator agent will have goals (e.g., fix bugs, add features) and achieve them by interacting with Codebuff through its CLI interface, similar to a human user.

## Architecture

### 1. Operator Package Structure
```
operator/
  src/
    agent/
      operator-agent.ts      # Core agent logic
      goal-manager.ts        # Manages agent goals and progress
      output-parser.ts       # Parses npm-app CLI output
    npm-app/
      headless-client.ts     # Manages npm-app child process
      process-manager.ts     # Process lifecycle and I/O
    types/
      goals.ts              # Goal and task types
      output.ts             # Output parsing types
    utils/
      git.ts               # Git operations
      fs.ts               # File system operations
      debug.ts            # Debug logging
```

### 2. Key Components

#### Headless Client
- Spawns and manages npm-app as a child process
- Sets environment variables for consistent output
- Manages stdin/stdout/stderr streams
- Handles process lifecycle
- Uses OutputParser to interpret CLI output

```typescript
interface HeadlessClientOptions {
  projectRoot: string;
  timeout?: number;        // Response timeout in ms
  debug?: boolean;         // Enable debug logging
  env?: Record<string, string>;  // Additional ENV vars
}

interface HeadlessClientResponse {
  type: 'ai-response' | 'tool-call' | 'status' | 'error';
  content: string;
  raw?: string;           // Original CLI output
}

class HeadlessClient {
  constructor(options: HeadlessClientOptions);
  sendInput(prompt: string): Promise<HeadlessClientResponse[]>;
  getOutput(): Observable<HeadlessClientResponse>;
  close(): Promise<void>;
}
```

#### Output Parser
- Parses raw CLI output into structured data
- Identifies different output types:
  - AI responses
  - Tool calls and results
  - Status messages
  - Errors
- Filters progress indicators
- Detects shell prompts

```typescript
interface ParsedOutput {
  type: OutputType;
  content: string;
  metadata?: Record<string, any>;
}

class OutputParser {
  parse(output: string): ParsedOutput[];
  parseStream(stream: Readable): Observable<ParsedOutput>;
}
```

#### Operator Agent
- Maintains goals and state
- Generates prompts
- Interprets responses
- Makes decisions

```typescript
interface OperatorGoal {
  type: 'bugfix' | 'feature' | 'refactor';
  description: string;
  acceptance: string[];
  maxAttempts?: number;
}

class OperatorAgent {
  constructor(goal: OperatorGoal, client: HeadlessClient);
  start(): Promise<void>;
  private generatePrompt(): string;
  private handleResponse(response: HeadlessClientResponse[]): Promise<void>;
  private validateChanges(): Promise<boolean>;
}
```

### 3. Process Management

#### Environment Setup
```typescript
const DEFAULT_ENV = {
  NO_COLOR: 'true',
  TERM: 'dumb',
  FORCE_COLOR: '0',
  COLUMNS: '80',
  LINES: '24',
  // Prevent terminal control sequences
  NO_CLEAR_LINE: 'true'
};
```

#### Process Communication
- Spawn npm-app with appropriate ENV
- Write prompts to stdin
- Read stdout/stderr
- Handle process exit
- Implement timeouts
- Support debug logging

## Implementation Phases

### Phase 1: Core Infrastructure (SDK-style)
1. Create operator package structure
2. Implement HeadlessClient:
   - Process spawning
   - I/O management
   - Environment setup
3. Implement OutputParser:
   - CLI output parsing
   - Stream processing
   - Pattern matching for different output types
4. Basic process management and error handling

### Phase 2: Agent Logic
1. Implement OperatorAgent
2. Basic goal management
3. Simple prompt generation
4. Response interpretation and decision making

### Phase 3: Tool Integration
1. Parse and verify tool execution output
2. File system operations via npm-app
3. Git integration
4. Output validation

### Phase 4: Testing & Validation
1. Unit tests for components
2. Integration tests
3. Simple goal achievement tests
4. Safety measures for self-modification

## Initial Test Goal

Start with a simple, well-defined goal to validate the system:

"Add a debug log statement to npm-app/src/cli.ts that logs when a user command is received"

This involves:
1. Reading the file
2. Making a small modification
3. Verifying the change
4. Running tests
5. Committing the change

## Safety Considerations

1. Git Integration
   - Always work in a new branch
   - Commit after each change
   - Maintain ability to revert

2. Validation
   - Run tests before/after changes
   - Type checking
   - Linting
   - Custom validation rules

3. Scope Limiting
   - Restrict file access
   - Validate tool commands
   - Rate limiting
   - Maximum attempts per goal

## Future Enhancements

### 1. Structured Output Mode
- Add --json-output flag to npm-app
- Emit structured data for tools and responses
- Keep human-readable output for CLI users

### 2. Containerization
- Run operator or npm-app in Docker container
- Use file-based communication if needed
- Provide consistent environment
- Handle dependencies
- Improved isolation for self-modification

### 3. Direct Integration
- Add programmatic API to npm-app
- Support direct function calls
- Structured data exchange
- Better type safety

## Next Steps

1. Review revised architecture focusing on SDK-style approach
2. Implement basic HeadlessClient with process management
3. Develop robust OutputParser
4. Test with simple file modifications