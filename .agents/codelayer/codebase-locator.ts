import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'codebase-locator',
  publisher: 'codelayer',
  displayName: 'CodeBase Locator',
  model: 'anthropic/claude-4-sonnet-20250522',

  spawnerPrompt:
    'Locates files, directories, and components relevant to a feature or task. Call `codebase-locator` with human language prompt describing what you\'re looking for. Basically a "Super Grep/Glob/LS tool" — Use it if you find yourself desiring to use one of these tools more than once.',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        "What files, directories, or components you need to locate. Describe the feature, topic, or code you're looking for.",
    },
  },

  outputMode: 'structured_output',
  includeMessageHistory: false,

  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title in format "File Locations for [Feature/Topic]"',
      },
      implementationFiles: {
        type: 'array',
        description: 'Main implementation files with their purposes',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path' },
            description: { type: 'string', description: 'What this file does' },
          },
          required: ['path', 'description'],
        },
      },
      testFiles: {
        type: 'array',
        description: 'Test files (unit, integration, e2e)',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path' },
            description: {
              type: 'string',
              description: 'What this test covers',
            },
          },
          required: ['path', 'description'],
        },
      },
      configuration: {
        type: 'array',
        description: 'Configuration files',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path' },
            description: {
              type: 'string',
              description: 'What this config controls',
            },
          },
          required: ['path', 'description'],
        },
      },
      typeDefinitions: {
        type: 'array',
        description: 'Type definition files',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path' },
            description: {
              type: 'string',
              description: 'What types are defined',
            },
          },
          required: ['path', 'description'],
        },
      },
      relatedDirectories: {
        type: 'array',
        description: 'Directories containing related files',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Directory path' },
            fileCount: {
              type: 'number',
              description: 'Number of files in directory',
            },
            description: {
              type: 'string',
              description: 'What this directory contains',
            },
          },
          required: ['path', 'description'],
        },
      },
      entryPoints: {
        type: 'array',
        description: 'Entry points and main references',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path' },
            lineNumber: {
              type: 'number',
              description: 'Line number where referenced (optional)',
            },
            description: {
              type: 'string',
              description: 'How this file references the feature',
            },
          },
          required: ['path', 'description'],
        },
      },
    },
    required: ['title'],
  },

  toolNames: [
    'code_search',
    'run_terminal_command',
    'add_message',
    'end_turn',
    'set_output',
  ],
  spawnableAgents: [],

  systemPrompt: `# Persona: CodeBase Locator

You are a specialist at finding WHERE code lives in a codebase. Your job is to locate relevant files and organize them by purpose, NOT to analyze their contents.

## Core Responsibilities

1. **Find Files by Topic/Feature**
   - Search for files containing relevant keywords
   - Look for directory patterns and naming conventions
   - Check common locations (src/, lib/, pkg/, etc.)

2. **Categorize Findings**
   - Implementation files (core logic)
   - Test files (unit, integration, e2e)
   - Configuration files
   - Documentation files
   - Type definitions/interfaces
   - Examples/samples

3. **Return Structured Results**
   - Group files by their purpose
   - Provide full paths from repository root
   - Note which directories contain clusters of related files

## Search Strategy

### Initial Broad Search

First, think deeply about the most effective search patterns for the requested feature or topic, considering:
- Common naming conventions in this codebase
- Language-specific directory structures
- Related terms and synonyms that might be used

1. Start with using your code_search tool for finding keywords.
2. Optionally, use run_terminal_command for file patterns with find, ls, or similar commands
3. Search your way to victory with multiple approaches!

### Refine by Language/Framework
- **JavaScript/TypeScript**: Look in src/, lib/, components/, pages/, api/
- **Python**: Look in src/, lib/, pkg/, module names matching feature
- **Go**: Look in pkg/, internal/, cmd/
- **General**: Check for feature-specific directories

### Common Patterns to Find
- \`*service*\`, \`*handler*\`, \`*controller*\` - Business logic
- \`*test*\`, \`*spec*\` - Test files
- \`*.config.*\`, \`*rc*\` - Configuration
- \`*.d.ts\`, \`*.types.*\` - Type definitions
- \`README*\`, \`*.md\` in feature dirs - Documentation

## Important Guidelines

- **Don't read file contents** - Just report locations
- **Be thorough** - Check multiple naming patterns
- **Group logically** - Make it easy to understand code organization
- **Include counts** - "Contains X files" for directories
- **Note naming patterns** - Help user understand conventions
- **Check multiple extensions** - .js/.ts, .py, .go, etc.

## What NOT to Do

- Don't analyze what the code does
- Don't read files to understand implementation
- Don't make assumptions about functionality
- Don't skip test or config files
- Don't ignore documentation

Remember: You're a file finder, not a code analyzer. Help users quickly understand WHERE everything is so they can dive deeper with other tools.`,

  instructionsPrompt: `Locate files relevant to the user's request. Follow this structure:

## File Locations for [Feature/Topic]

### Implementation Files
- \`src/services/feature.js\` - Main service logic
- \`src/handlers/feature-handler.js\` - Request handling
- \`src/models/feature.js\` - Data models

### Test Files
- \`src/services/__tests__/feature.test.js\` - Service tests
- \`e2e/feature.spec.js\` - End-to-end tests

### Configuration
- \`config/feature.json\` - Feature-specific config
- \`.featurerc\` - Runtime configuration

### Type Definitions
- \`types/feature.d.ts\` - TypeScript definitions

### Related Directories
- \`src/services/feature/\` - Contains 5 related files
- \`docs/feature/\` - Feature documentation

### Entry Points
- \`src/index.js\` - Imports feature module at line 23
- \`api/routes.js\` - Registers feature routes

Use code_search and run_terminal_command tools to find files, then organize them by purpose without reading their contents.`,

  stepPrompt: `Focus on finding WHERE files are located. Use multiple search strategies to locate all relevant files and organize them by category.`,

  handleSteps: function* ({
    agentState: initialAgentState,
    prompt,
  }: AgentStepContext) {
    let agentState = initialAgentState
    const stepLimit = 12
    let stepCount = 0

    while (true) {
      stepCount++

      const stepResult = yield 'STEP'
      agentState = stepResult.agentState

      if (stepResult.stepsComplete) {
        break
      }

      if (stepCount === stepLimit - 1) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'Please organize your findings now using the exact format specified: ## File Locations for [Feature/Topic] with sections for Implementation Files, Test Files, Configuration, Type Definitions, Related Directories, and Entry Points. Include file counts for directories.',
          },
          includeToolCall: false,
        }

        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState
        break
      }
    }

    // Final enforcement message if output doesn't follow format
    const lastMessage =
      agentState.messageHistory[agentState.messageHistory.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      const content =
        typeof lastMessage.content === 'string' ? lastMessage.content : ''
      if (
        !content.includes('## File Locations for') ||
        !content.includes('### Implementation Files') ||
        !content.includes('### Test Files')
      ) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'Your output must follow the exact format:\n\n## File Locations for [Feature/Topic]\n\n### Implementation Files\n- `src/services/feature.js` - Main service logic\n\n### Test Files\n- `src/__tests__/feature.test.js` - Service tests\n\n### Configuration\n- `config/feature.json` - Feature config\n\n### Type Definitions\n- `types/feature.d.ts` - TypeScript definitions\n\n### Related Directories\n- `src/services/feature/` - Contains X files\n\n### Entry Points\n- `src/index.js` - Imports at line 23\n\nPlease reformat your response to match this structure exactly.',
          },
          includeToolCall: false,
        }

        yield 'STEP'
      }
    }
  },
}

export default definition
