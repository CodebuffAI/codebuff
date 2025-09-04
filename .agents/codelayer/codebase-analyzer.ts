import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'codebase-analyzer',
  publisher: 'codelayer',
  displayName: 'CodeBase Analyzer',
  model: 'anthropic/claude-4-sonnet-20250522',

  spawnerPrompt:
    'Analyzes codebase implementation details. Call the codebase-analyzer agent when you need to find detailed information about specific components. As always, the more detailed your request prompt, the better! :)',

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What specific component, feature, or implementation details you need analyzed. Be as specific as possible about what you want to understand.',
    },
  },

  outputMode: 'structured_output',
  includeMessageHistory: false,

  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title in format "Analysis: [Feature/Component Name]"',
      },
      overview: {
        type: 'string',
        description: '2-3 sentence summary of how it works',
      },
      entryPoints: {
        type: 'array',
        description: 'Entry points into the component',
        items: {
          type: 'object',
          properties: {
            location: {
              type: 'string',
              description:
                'File path with line number, e.g. "api/routes.js:45"',
            },
            description: {
              type: 'string',
              description: 'What this entry point does',
            },
          },
          required: ['location', 'description'],
        },
      },
      coreImplementation: {
        type: 'array',
        description: 'Detailed breakdown of core implementation steps',
        items: {
          type: 'object',
          properties: {
            stepName: {
              type: 'string',
              description: 'Name of the implementation step',
            },
            location: {
              type: 'string',
              description:
                'File path with line numbers, e.g. "handlers/webhook.js:15-32"',
            },
            details: {
              type: 'array',
              description: 'Detailed explanation points',
              items: { type: 'string' },
            },
          },
          required: ['stepName', 'location', 'details'],
        },
      },
      dataFlow: {
        type: 'array',
        description: 'Step-by-step data flow through the system',
        items: {
          type: 'object',
          properties: {
            step: { type: 'number', description: 'Step number in the flow' },
            description: {
              type: 'string',
              description: 'What happens at this step',
            },
            location: {
              type: 'string',
              description: 'File path with line number',
            },
          },
          required: ['step', 'description', 'location'],
        },
      },
      keyPatterns: {
        type: 'array',
        description: 'Key architectural patterns identified',
        items: {
          type: 'object',
          properties: {
            patternName: { type: 'string', description: 'Name of the pattern' },
            description: {
              type: 'string',
              description: 'How the pattern is implemented',
            },
            location: {
              type: 'string',
              description: 'Where this pattern is found',
            },
          },
          required: ['patternName', 'description'],
        },
      },
      configuration: {
        type: 'array',
        description: 'Configuration settings and their locations',
        items: {
          type: 'object',
          properties: {
            setting: { type: 'string', description: 'What is configured' },
            location: {
              type: 'string',
              description: 'File path with line number',
            },
            description: {
              type: 'string',
              description: 'What this configuration controls',
            },
          },
          required: ['setting', 'location', 'description'],
        },
      },
      errorHandling: {
        type: 'array',
        description: 'Error handling mechanisms',
        items: {
          type: 'object',
          properties: {
            errorType: {
              type: 'string',
              description: 'Type of error or scenario',
            },
            location: {
              type: 'string',
              description: 'File path with line number',
            },
            mechanism: {
              type: 'string',
              description: 'How the error is handled',
            },
          },
          required: ['errorType', 'location', 'mechanism'],
        },
      },
    },
    required: ['title', 'overview'],
  },

  toolNames: [
    'read_files',
    'code_search',
    'find_files',
    'add_message',
    'end_turn',
    'set_output',
  ],
  spawnableAgents: [],

  systemPrompt: `# Persona: CodeBase Analyzer

You are a specialist at understanding HOW code works. Your job is to analyze implementation details, trace data flow, and explain technical workings with precise file:line references.

## Core Responsibilities

1. **Analyze Implementation Details**
   - Read specific files to understand logic
   - Identify key functions and their purposes
   - Trace method calls and data transformations
   - Note important algorithms or patterns

2. **Trace Data Flow**
   - Follow data from entry to exit points
   - Map transformations and validations
   - Identify state changes and side effects
   - Document API contracts between components

3. **Identify Architectural Patterns**
   - Recognize design patterns in use
   - Note architectural decisions
   - Identify conventions and best practices
   - Find integration points between systems

## Analysis Strategy

### Step 1: Read Entry Points
- Start with main files mentioned in the request
- Look for exports, public methods, or route handlers
- Identify the "surface area" of the component

### Step 2: Follow the Code Path
- Trace function calls step by step
- Read each file involved in the flow
- Note where data is transformed
- Identify external dependencies
- Take time to deeply understand how all these pieces connect and interact

### Step 3: Understand Key Logic
- Focus on business logic, not boilerplate
- Identify validation, transformation, error handling
- Note any complex algorithms or calculations
- Look for configuration or feature flags

## Important Guidelines

- **Always include file:line references** for claims
- **Read files thoroughly** before making statements
- **Trace actual code paths** don't assume
- **Focus on "how"** not "what" or "why"
- **Be precise** about function names and variables
- **Note exact transformations** with before/after

## What NOT to Do

- Don't guess about implementation
- Don't skip error handling or edge cases
- Don't ignore configuration or dependencies
- Don't make architectural recommendations
- Don't analyze code quality or suggest improvements

Remember: You're explaining HOW the code currently works, with surgical precision and exact references. Help users understand the implementation as it exists today.`,

  instructionsPrompt: `Analyze the requested component or feature in detail. Follow this structure:

## Analysis: [Feature/Component Name]

### Overview
[2-3 sentence summary of how it works]

### Entry Points
- \`file.js:45\` - Function or endpoint description
- \`handler.js:12\` - Key method description

### Core Implementation

#### 1. [Step Name] (\`file.js:15-32\`)
- Detailed explanation with exact line references
- What happens at each step
- Any validation or error handling

#### 2. [Next Step] (\`service.js:8-45\`)
- Continue tracing the flow
- Note data transformations
- Identify side effects

### Data Flow
1. Entry at \`file.js:45\`
2. Processing at \`handler.js:12\`
3. Storage at \`store.js:55\`

### Key Patterns
- **Pattern Name**: Description with file references
- **Architecture**: How components interact

### Configuration
- Settings locations with file:line references
- Feature flags and their effects

### Error Handling
- How errors are caught and handled
- Retry logic and fallbacks

Use the read_files, code_search, and find_files tools to gather information, then provide a comprehensive analysis with exact file:line references.`,

  stepPrompt: `Focus on understanding HOW the code works. Read files, trace execution paths, and provide precise implementation details with exact file:line references.`,

  handleSteps: function* ({
    agentState: initialAgentState,
    prompt,
  }: AgentStepContext) {
    let agentState = initialAgentState
    const stepLimit = 15
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
              'Please finish your analysis now using the exact format specified in your instructions. Make sure to include all required sections: Overview, Entry Points, Core Implementation, Data Flow, Key Patterns, Configuration, and Error Handling with precise file:line references.',
          },
          includeToolCall: false,
        }

        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState
        break
      }
    }

    // Final enforcement message if analysis doesn't follow format
    const lastMessage =
      agentState.messageHistory[agentState.messageHistory.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      const content =
        typeof lastMessage.content === 'string' ? lastMessage.content : ''
      if (
        !content.includes('## Analysis:') ||
        !content.includes('### Overview') ||
        !content.includes('### Entry Points')
      ) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'Your analysis must follow the exact format:\n\n## Analysis: [Feature/Component Name]\n\n### Overview\n[2-3 sentence summary]\n\n### Entry Points\n- `file.js:45` - Function description\n\n### Core Implementation\n\n#### 1. [Step Name] (`file.js:15-32`)\n- Detailed explanation\n\n### Data Flow\n1. Entry at `file.js:45`\n\n### Key Patterns\n- **Pattern Name**: Description\n\n### Configuration\n- Settings locations\n\n### Error Handling\n- How errors are handled\n\nPlease reformat your response to match this structure exactly.',
          },
          includeToolCall: false,
        }

        yield 'STEP'
      }
    }
  },
}

export default definition
