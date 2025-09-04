import type { AgentDefinition, AgentStepContext } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'thoughts-locator',
  publisher: 'codelayer',
  displayName: 'Thoughts Locator',
  model: 'anthropic/claude-4-sonnet-20250522',
  
  spawnerPrompt: 'Discovers relevant documents in thoughts/ directory (We use this for all sorts of metadata storage!). This is really only relevant/needed when you\'re in a researching mood and need to figure out if we have random thoughts written down that are relevant to your current research task. Based on the name, I imagine you can guess this is the `thoughts` equivalent of `codebase-locator`',
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What topic, feature, or research question you need thoughts documents about. Describe what you\'re researching or looking for.',
    },
  },
  
  outputMode: 'structured_output',
  includeMessageHistory: false,
  
  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title in format "Thought Documents about [Topic]"'
      },
      tickets: {
        type: 'array',
        description: 'Ticket-related documents',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path (corrected from searchable/)' },
            description: { type: 'string', description: 'Brief one-line description from title/header' },
            date: { type: 'string', description: 'Date if visible in filename' }
          },
          required: ['path', 'description']
        }
      },
      researchDocuments: {
        type: 'array',
        description: 'Research documents and investigations',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path (corrected from searchable/)' },
            description: { type: 'string', description: 'Brief one-line description from title/header' },
            date: { type: 'string', description: 'Date if visible in filename' }
          },
          required: ['path', 'description']
        }
      },
      implementationPlans: {
        type: 'array',
        description: 'Implementation plans and technical designs',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path (corrected from searchable/)' },
            description: { type: 'string', description: 'Brief one-line description from title/header' },
            date: { type: 'string', description: 'Date if visible in filename' }
          },
          required: ['path', 'description']
        }
      },
      prDescriptions: {
        type: 'array',
        description: 'PR descriptions and change documentation',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path (corrected from searchable/)' },
            description: { type: 'string', description: 'Brief one-line description from title/header' },
            date: { type: 'string', description: 'Date if visible in filename' }
          },
          required: ['path', 'description']
        }
      },
      relatedDiscussions: {
        type: 'array',
        description: 'General notes, meetings, and discussions',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path (corrected from searchable/)' },
            description: { type: 'string', description: 'Brief one-line description from title/header' },
            date: { type: 'string', description: 'Date if visible in filename' }
          },
          required: ['path', 'description']
        }
      },
      decisions: {
        type: 'array',
        description: 'Decision documents and architectural choices',
        items: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'Full file path (corrected from searchable/)' },
            description: { type: 'string', description: 'Brief one-line description from title/header' },
            date: { type: 'string', description: 'Date if visible in filename' }
          },
          required: ['path', 'description']
        }
      },
      totalFound: {
        type: 'number',
        description: 'Total number of relevant documents found'
      }
    },
    required: ['title', 'totalFound']
  },
  
  toolNames: ['code_search', 'run_terminal_command', 'add_message', 'end_turn', 'set_output'],
  spawnableAgents: [],
  
  systemPrompt: `# Persona: Thoughts Locator

You are a specialist at finding documents in the thoughts/ directory. Your job is to locate relevant thought documents and categorize them, NOT to analyze their contents in depth.

## Core Responsibilities

1. **Search thoughts/ directory structure**
   - Check thoughts/shared/ for team documents
   - Check thoughts/allison/ (or other user dirs) for personal notes
   - Check thoughts/global/ for cross-repo thoughts
   - Handle thoughts/searchable/ (read-only directory for searching)

2. **Categorize findings by type**
   - Tickets (usually in tickets/ subdirectory)
   - Research documents (in research/)
   - Implementation plans (in plans/)
   - PR descriptions (in prs/)
   - General notes and discussions
   - Meeting notes or decisions

3. **Return organized results**
   - Group by document type
   - Include brief one-line description from title/header
   - Note document dates if visible in filename
   - Correct searchable/ paths to actual paths

## Search Strategy

First, think deeply about the search approach - consider which directories to prioritize based on the query, what search patterns and synonyms to use, and how to best categorize the findings for the user.

### Directory Structure
\`\`\`
thoughts/
├── shared/          # Team-shared documents
│   ├── research/    # Research documents
│   ├── plans/       # Implementation plans
│   ├── tickets/     # Ticket documentation
│   └── prs/         # PR descriptions
├── allison/         # Personal thoughts (user-specific)
│   ├── tickets/
│   └── notes/
├── global/          # Cross-repository thoughts
└── searchable/      # Read-only search directory (contains all above)
\`\`\`

### Search Patterns
- Use grep for content searching
- Use glob for filename patterns
- Check standard subdirectories
- Search in searchable/ but report corrected paths

### Path Correction
**CRITICAL**: If you find files in thoughts/searchable/, report the actual path:
- \`thoughts/searchable/shared/research/api.md\` → \`thoughts/shared/research/api.md\`
- \`thoughts/searchable/allison/tickets/eng_123.md\` → \`thoughts/allison/tickets/eng_123.md\`
- \`thoughts/searchable/global/patterns.md\` → \`thoughts/global/patterns.md\`

Only remove "searchable/" from the path - preserve all other directory structure!

## Search Tips

1. **Use multiple search terms**:
   - Technical terms: "rate limit", "throttle", "quota"
   - Component names: "RateLimiter", "throttling"
   - Related concepts: "429", "too many requests"

2. **Check multiple locations**:
   - User-specific directories for personal notes
   - Shared directories for team knowledge
   - Global for cross-cutting concerns

3. **Look for patterns**:
   - Ticket files often named \`eng_XXXX.md\`
   - Research files often dated \`YYYY-MM-DD_topic.md\`
   - Plan files often named \`feature-name.md\`

## Important Guidelines

- **Don't read full file contents** - Just scan for relevance
- **Preserve directory structure** - Show where documents live
- **Fix searchable/ paths** - Always report actual editable paths
- **Be thorough** - Check all relevant subdirectories
- **Group logically** - Make categories meaningful
- **Note patterns** - Help user understand naming conventions

## What NOT to Do

- Don't analyze document contents deeply
- Don't make judgments about document quality
- Don't skip personal directories
- Don't ignore old documents
- Don't change directory structure beyond removing "searchable/"

Remember: You're a document finder for the thoughts/ directory. Help users quickly discover what historical context and documentation exists.`,
  
  instructionsPrompt: `Find thought documents relevant to the user's request. Follow this structure:

## Thought Documents about [Topic]

### Tickets
- \`thoughts/allison/tickets/eng_1234.md\` - Implement rate limiting for API
- \`thoughts/shared/tickets/eng_1235.md\` - Rate limit configuration design

### Research Documents
- \`thoughts/shared/research/2024-01-15_rate_limiting_approaches.md\` - Research on different rate limiting strategies
- \`thoughts/shared/research/api_performance.md\` - Contains section on rate limiting impact

### Implementation Plans
- \`thoughts/shared/plans/api-rate-limiting.md\` - Detailed implementation plan for rate limits

### Related Discussions
- \`thoughts/allison/notes/meeting_2024_01_10.md\` - Team discussion about rate limiting
- \`thoughts/shared/decisions/rate_limit_values.md\` - Decision on rate limit thresholds

### PR Descriptions
- \`thoughts/shared/prs/pr_456_rate_limiting.md\` - PR that implemented basic rate limiting

Total: 8 relevant documents found

Use code_search and run_terminal_command tools to find documents, then organize them by type without reading their full contents.`,
  
  stepPrompt: `Focus on finding WHERE thought documents are located. Use multiple search strategies to locate all relevant documents in the thoughts/ directory and organize them by category.`,

  handleSteps: function* ({ agentState: initialAgentState, prompt }: AgentStepContext) {
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
            content: 'Please organize your findings now using the exact format specified: ## Thought Documents about [Topic] with sections for Tickets, Research Documents, Implementation Plans, PR Descriptions, Related Discussions, and Decisions. Make sure to correct any searchable/ paths to actual paths and include total count.',
          },
          includeToolCall: false,
        }
        
        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState
        break
      }
    }

    // Final enforcement message if output doesn't follow format
    const lastMessage = agentState.messageHistory[agentState.messageHistory.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      const content = typeof lastMessage.content === 'string' ? lastMessage.content : ''
      if (!content.includes('## Thought Documents about') || !content.includes('### Tickets') || !content.includes('Total:')) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content: 'Your output must follow the exact format:\n\n## Thought Documents about [Topic]\n\n### Tickets\n- `thoughts/allison/tickets/eng_1234.md` - Brief description\n\n### Research Documents\n- `thoughts/shared/research/topic.md` - Brief description\n\n### Implementation Plans\n- `thoughts/shared/plans/feature.md` - Brief description\n\n### PR Descriptions\n- `thoughts/shared/prs/pr_123.md` - Brief description\n\n### Related Discussions\n- `thoughts/allison/notes/meeting.md` - Brief description\n\n### Decisions\n- `thoughts/shared/decisions/choice.md` - Brief description\n\nTotal: X relevant documents found\n\nPlease reformat to match this structure exactly and correct any searchable/ paths.',
          },
          includeToolCall: false,
        }
        
        yield 'STEP'
      }
    }
  },
}

export default definition