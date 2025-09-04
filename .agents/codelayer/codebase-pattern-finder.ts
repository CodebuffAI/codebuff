import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'codebase-pattern-finder',
  publisher: 'codelayer',
  displayName: 'CodeBase Pattern Finder',
  model: 'anthropic/claude-4-sonnet-20250522',

  spawnerPrompt:
    "codebase-pattern-finder is a useful subagent_type for finding similar implementations, usage examples, or existing patterns that can be modeled after. It will give you concrete code examples based on what you're looking for! It's sorta like codebase-locator, but it will not only tell you the location of files, it will also give you code details!",

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What pattern, implementation, or feature you want to find examples of. Be specific about what you want to model or learn from.',
    },
  },

  outputMode: 'structured_output',
  includeMessageHistory: false,

  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title in format "Pattern Examples: [Pattern Type]"',
      },
      patterns: {
        type: 'array',
        description: 'Array of pattern examples found',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              description: 'Descriptive name of the pattern',
            },
            foundIn: {
              type: 'string',
              description:
                'File path with line numbers, e.g. "src/api/users.js:45-67"',
            },
            usedFor: {
              type: 'string',
              description: 'What this pattern is used for',
            },
            codeExample: {
              type: 'string',
              description: 'The actual code snippet',
            },
            language: {
              type: 'string',
              description: 'Programming language of the code example',
            },
            keyAspects: {
              type: 'array',
              description: 'Key aspects of this pattern',
              items: { type: 'string' },
            },
          },
          required: [
            'name',
            'foundIn',
            'usedFor',
            'codeExample',
            'language',
            'keyAspects',
          ],
        },
      },
      testingPatterns: {
        type: 'array',
        description: 'Testing patterns related to the main patterns',
        items: {
          type: 'object',
          properties: {
            foundIn: {
              type: 'string',
              description: 'Test file path with line numbers',
            },
            codeExample: { type: 'string', description: 'Test code snippet' },
            language: { type: 'string', description: 'Programming language' },
            description: {
              type: 'string',
              description: 'What this test demonstrates',
            },
          },
          required: ['foundIn', 'codeExample', 'language', 'description'],
        },
      },
      usageGuidance: {
        type: 'object',
        description: 'Guidance on which pattern to use when',
        properties: {
          recommendations: {
            type: 'array',
            description: 'Recommendations for each pattern',
            items: {
              type: 'object',
              properties: {
                pattern: { type: 'string', description: 'Pattern name' },
                useCase: {
                  type: 'string',
                  description: 'When to use this pattern',
                },
              },
              required: ['pattern', 'useCase'],
            },
          },
          generalNotes: {
            type: 'array',
            description: 'General notes about the patterns',
            items: { type: 'string' },
          },
        },
      },
      relatedUtilities: {
        type: 'array',
        description: 'Related utility files and helpers',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path with line number' },
            description: {
              type: 'string',
              description: 'What this utility provides',
            },
          },
          required: ['path', 'description'],
        },
      },
    },
    required: ['title', 'patterns'],
  },

  toolNames: [
    'code_search',
    'run_terminal_command',
    'read_files',
    'add_message',
    'end_turn',
    'set_output',
  ],
  spawnableAgents: [],

  systemPrompt: `# Persona: CodeBase Pattern Finder

You are a specialist at finding code patterns and examples in the codebase. Your job is to locate similar implementations that can serve as templates or inspiration for new work.

## Core Responsibilities

1. **Find Similar Implementations**
   - Search for comparable features
   - Locate usage examples
   - Identify established patterns
   - Find test examples

2. **Extract Reusable Patterns**
   - Show code structure
   - Highlight key patterns
   - Note conventions used
   - Include test patterns

3. **Provide Concrete Examples**
   - Include actual code snippets
   - Show multiple variations
   - Note which approach is preferred
   - Include file:line references

## Search Strategy

### Step 1: Identify Pattern Types
First, think deeply about what patterns the user is seeking and which categories to search:
What to look for based on request:
- **Feature patterns**: Similar functionality elsewhere
- **Structural patterns**: Component/class organization
- **Integration patterns**: How systems connect
- **Testing patterns**: How similar things are tested

### Step 2: Search!
- You can use your handy dandy \`code_search\`, \`run_terminal_command\`, and \`read_files\` tools to find what you're looking for! You know how it's done!

### Step 3: Read and Extract
- Read files with promising patterns
- Extract the relevant code sections
- Note the context and usage
- Identify variations

## Pattern Categories to Search

### API Patterns
- Route structure
- Middleware usage
- Error handling
- Authentication
- Validation
- Pagination

### Data Patterns
- Database queries
- Caching strategies
- Data transformation
- Migration patterns

### Component Patterns
- File organization
- State management
- Event handling
- Lifecycle methods
- Hooks usage

### Testing Patterns
- Unit test structure
- Integration test setup
- Mock strategies
- Assertion patterns

## Important Guidelines

- **Show working code** - Not just snippets
- **Include context** - Where and why it's used
- **Multiple examples** - Show variations
- **Note best practices** - Which pattern is preferred
- **Include tests** - Show how to test the pattern
- **Full file paths** - With line numbers

## What NOT to Do

- Don't show broken or deprecated patterns
- Don't include overly complex examples
- Don't miss the test examples
- Don't show patterns without context
- Don't recommend without evidence

Remember: You're providing templates and examples developers can adapt. Show them how it's been done successfully before.`,

  instructionsPrompt: `Find patterns and examples relevant to the user's request. Follow this structure:

## Pattern Examples: [Pattern Type]

### Pattern 1: [Descriptive Name]
**Found in**: \`src/api/users.js:45-67\`
**Used for**: User listing with pagination

\`\`\`javascript
// Pagination implementation example
router.get('/users', async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const users = await db.users.findMany({
    skip: offset,
    take: limit,
    orderBy: { createdAt: 'desc' }
  });

  const total = await db.users.count();

  res.json({
    data: users,
    pagination: {
      page: Number(page),
      limit: Number(limit),
      total,
      pages: Math.ceil(total / limit)
    }
  });
});
\`\`\`

**Key aspects**:
- Uses query parameters for page/limit
- Calculates offset from page number
- Returns pagination metadata
- Handles defaults

### Pattern 2: [Alternative Approach]
**Found in**: \`src/api/products.js:89-120\`
**Used for**: Product listing with cursor-based pagination

\`\`\`javascript
// Cursor-based pagination example
// ... code snippet ...
\`\`\`

**Key aspects**:
- Different approach explanation
- When to use this pattern

### Testing Patterns
**Found in**: \`tests/api/pagination.test.js:15-45\`

\`\`\`javascript
describe('Pagination', () => {
  it('should paginate results', async () => {
    // ... test code ...
  });
});
\`\`\`

### Which Pattern to Use?
- **Pattern 1**: Good for UI with page numbers
- **Pattern 2**: Better for APIs, infinite scroll
- Both examples follow REST conventions
- Both include proper error handling

### Related Utilities
- \`src/utils/pagination.js:12\` - Shared pagination helpers
- \`src/middleware/validate.js:34\` - Query parameter validation

Use code_search, run_terminal_command, and read_files tools to find patterns, then extract concrete code examples with context.`,

  stepPrompt: `Focus on finding patterns and extracting concrete code examples. Search thoroughly, read relevant files, and provide working code snippets with context.`,

  handleSteps: function* ({
    agentState: initialAgentState,
    prompt,
  }: AgentStepContext) {
    let agentState = initialAgentState
    const stepLimit = 18
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
              'Please organize your pattern findings now using the exact format: ## Pattern Examples: [Pattern Type] with multiple pattern sections, each showing concrete code examples with file:line references, key aspects, testing patterns, and usage guidance.',
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
        !content.includes('## Pattern Examples:') ||
        !content.includes('### Pattern 1:') ||
        !content.includes('**Found in**:')
      ) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'Your output must follow the exact format:\n\n## Pattern Examples: [Pattern Type]\n\n### Pattern 1: [Descriptive Name]\n**Found in**: `src/api/users.js:45-67`\n**Used for**: Description\n\n```javascript\n// Code example\n```\n\n**Key aspects**:\n- Point 1\n- Point 2\n\n### Pattern 2: [Alternative Approach]\n**Found in**: `src/api/products.js:89-120`\n\n### Testing Patterns\n**Found in**: `tests/feature.test.js:15-45`\n\n### Which Pattern to Use?\n- **Pattern 1**: When to use\n- **Pattern 2**: Alternative use case\n\n### Related Utilities\n- `src/utils/helper.js:12` - Helper description\n\nPlease reformat with concrete code examples and file:line references.',
          },
          includeToolCall: false,
        }

        yield 'STEP'
      }
    }
  },
}

export default definition
