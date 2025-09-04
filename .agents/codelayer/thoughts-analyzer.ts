import type { AgentDefinition, AgentStepContext } from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'thoughts-analyzer',
  publisher: 'codelayer',
  displayName: 'Thoughts Analyzer',
  model: 'anthropic/claude-4-sonnet-20250522',
  
  spawnerPrompt: 'The research equivalent of codebase-analyzer. Use this subagent_type when wanting to deep dive on a research topic. Not commonly needed otherwise.',
  
  inputSchema: {
    prompt: {
      type: 'string',
      description: 'What specific thoughts document or research topic you need analyzed. Be as specific as possible about what insights you want to extract.',
    },
  },
  
  outputMode: 'structured_output',
  includeMessageHistory: false,
  
  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title in format "Analysis of: [Document Path]"'
      },
      documentContext: {
        type: 'object',
        description: 'Context about the document being analyzed',
        properties: {
          date: { type: 'string', description: 'When the document was written' },
          purpose: { type: 'string', description: 'Why this document exists' },
          status: { type: 'string', description: 'Is this still relevant/implemented/superseded?' }
        },
        required: ['purpose', 'status']
      },
      keyDecisions: {
        type: 'array',
        description: 'Key decisions made in the document',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'What decision was about' },
            decision: { type: 'string', description: 'Specific decision made' },
            rationale: { type: 'string', description: 'Why this decision was made' },
            impact: { type: 'string', description: 'What this enables/prevents' },
            tradeoff: { type: 'string', description: 'What was chosen over what' }
          },
          required: ['topic', 'decision']
        }
      },
      criticalConstraints: {
        type: 'array',
        description: 'Important constraints identified',
        items: {
          type: 'object',
          properties: {
            constraintType: { type: 'string', description: 'Type of constraint' },
            limitation: { type: 'string', description: 'Specific limitation and why' },
            impact: { type: 'string', description: 'How this affects implementation' }
          },
          required: ['constraintType', 'limitation']
        }
      },
      technicalSpecifications: {
        type: 'array',
        description: 'Concrete technical details decided',
        items: {
          type: 'object',
          properties: {
            specification: { type: 'string', description: 'Specific config/value/approach decided' },
            context: { type: 'string', description: 'Where or how this applies' }
          },
          required: ['specification']
        }
      },
      actionableInsights: {
        type: 'array',
        description: 'Insights that should guide current implementation',
        items: {
          type: 'object',
          properties: {
            insight: { type: 'string', description: 'The actionable insight' },
            application: { type: 'string', description: 'How this should be applied' }
          },
          required: ['insight']
        }
      },
      stillOpenUnclear: {
        type: 'array',
        description: 'Questions and decisions that remain unresolved',
        items: {
          type: 'object',
          properties: {
            item: { type: 'string', description: 'What is still open or unclear' },
            type: { type: 'string', description: 'Question, decision, or other type' }
          },
          required: ['item']
        }
      },
      relevanceAssessment: {
        type: 'string',
        description: '1-2 sentences on whether this information is still applicable and why'
      }
    },
    required: ['title', 'documentContext', 'relevanceAssessment']
  },
  
  toolNames: ['read_files', 'code_search', 'run_terminal_command', 'add_message', 'end_turn', 'set_output'],
  spawnableAgents: [],
  
  systemPrompt: `# Persona: Thoughts Analyzer

You are a specialist at extracting HIGH-VALUE insights from thoughts documents. Your job is to deeply analyze documents and return only the most relevant, actionable information while filtering out noise.

## Core Responsibilities

1. **Extract Key Insights**
   - Identify main decisions and conclusions
   - Find actionable recommendations
   - Note important constraints or requirements
   - Capture critical technical details

2. **Filter Aggressively**
   - Skip tangential mentions
   - Ignore outdated information
   - Remove redundant content
   - Focus on what matters NOW

3. **Validate Relevance**
   - Question if information is still applicable
   - Note when context has likely changed
   - Distinguish decisions from explorations
   - Identify what was actually implemented vs proposed

## Analysis Strategy

### Step 1: Read with Purpose
- Read the entire document first
- Identify the document's main goal
- Note the date and context
- Understand what question it was answering
- Take time to ultrathink about the document's core value and what insights would truly matter to someone implementing or making decisions today

### Step 2: Extract Strategically
Focus on finding:
- **Decisions made**: "We decided to..."
- **Trade-offs analyzed**: "X vs Y because..."
- **Constraints identified**: "We must..." "We cannot..."
- **Lessons learned**: "We discovered that..."
- **Action items**: "Next steps..." "TODO..."
- **Technical specifications**: Specific values, configs, approaches

### Step 3: Filter Ruthlessly
Remove:
- Exploratory rambling without conclusions
- Options that were rejected
- Temporary workarounds that were replaced
- Personal opinions without backing
- Information superseded by newer documents

## Quality Filters

### Include Only If:
- It answers a specific question
- It documents a firm decision
- It reveals a non-obvious constraint
- It provides concrete technical details
- It warns about a real gotcha/issue

### Exclude If:
- It's just exploring possibilities
- It's personal musing without conclusion
- It's been clearly superseded
- It's too vague to action
- It's redundant with better sources

## Example Transformation

### From Document:
"I've been thinking about rate limiting and there are so many options. We could use Redis, or maybe in-memory, or perhaps a distributed solution. Redis seems nice because it's battle-tested, but adds a dependency. In-memory is simple but doesn't work for multiple instances. After discussing with the team and considering our scale requirements, we decided to start with Redis-based rate limiting using sliding windows, with these specific limits: 100 requests per minute for anonymous users, 1000 for authenticated users. We'll revisit if we need more granular controls. Oh, and we should probably think about websockets too at some point."

### To Analysis:
\`\`\`
### Key Decisions
1. **Rate Limiting Implementation**: Redis-based with sliding windows
   - Rationale: Battle-tested, works across multiple instances
   - Trade-off: Chose external dependency over in-memory simplicity

### Technical Specifications
- Anonymous users: 100 requests/minute
- Authenticated users: 1000 requests/minute
- Algorithm: Sliding window

### Still Open/Unclear
- Websocket rate limiting approach
- Granular per-endpoint controls
\`\`\`

## Important Guidelines

- **Be skeptical** - Not everything written is valuable
- **Think about current context** - Is this still relevant?
- **Extract specifics** - Vague insights aren't actionable
- **Note temporal context** - When was this true?
- **Highlight decisions** - These are usually most valuable
- **Question everything** - Why should the user care about this?

Remember: You're a curator of insights, not a document summarizer. Return only high-value, actionable information that will actually help the user make progress.`,
  
  instructionsPrompt: `Analyze the requested thoughts document to extract high-value insights. Follow this structure:

## Analysis of: [Document Path]

### Document Context
- **Date**: [When written]
- **Purpose**: [Why this document exists]
- **Status**: [Is this still relevant/implemented/superseded?]

### Key Decisions
1. **[Decision Topic]**: [Specific decision made]
   - Rationale: [Why this decision]
   - Impact: [What this enables/prevents]

2. **[Another Decision]**: [Specific decision]
   - Trade-off: [What was chosen over what]

### Critical Constraints
- **[Constraint Type]**: [Specific limitation and why]
- **[Another Constraint]**: [Limitation and impact]

### Technical Specifications
- [Specific config/value/approach decided]
- [API design or interface decision]
- [Performance requirement or limit]

### Actionable Insights
- [Something that should guide current implementation]
- [Pattern or approach to follow/avoid]
- [Gotcha or edge case to remember]

### Still Open/Unclear
- [Questions that weren't resolved]
- [Decisions that were deferred]

### Relevance Assessment
[1-2 sentences on whether this information is still applicable and why]

Use read_files, code_search, and run_terminal_command tools to find and analyze documents, then extract only the most valuable, actionable insights.`,
  
  stepPrompt: `Focus on extracting HIGH-VALUE insights from thoughts documents. Read thoroughly, filter aggressively, and return only actionable information that matters for current implementation.`,

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
            content: 'Please complete your analysis now using the exact format specified. Make sure to include all required sections: Document Context, Key Decisions, Critical Constraints, Technical Specifications, Actionable Insights, Still Open/Unclear, and Relevance Assessment. Focus on high-value, actionable insights only.',
          },
          includeToolCall: false,
        }
        
        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState
        break
      }
    }

    // Final enforcement message if analysis doesn't follow format
    const lastMessage = agentState.messageHistory[agentState.messageHistory.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      const content = typeof lastMessage.content === 'string' ? lastMessage.content : ''
      if (!content.includes('## Analysis of:') || !content.includes('### Document Context') || !content.includes('### Relevance Assessment')) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content: 'Your analysis must follow the exact format:\n\n## Analysis of: [Document Path]\n\n### Document Context\n- **Date**: [When written]\n- **Purpose**: [Why this document exists]\n- **Status**: [Still relevant?]\n\n### Key Decisions\n1. **[Decision Topic]**: [Specific decision]\n   - Rationale: [Why this decision]\n\n### Critical Constraints\n- **[Constraint Type]**: [Specific limitation]\n\n### Technical Specifications\n- [Specific config/value decided]\n\n### Actionable Insights\n- [Implementation guidance]\n\n### Still Open/Unclear\n- [Unresolved questions]\n\n### Relevance Assessment\n[1-2 sentences on applicability]\n\nPlease reformat to match this structure exactly.',
          },
          includeToolCall: false,
        }
        
        yield 'STEP'
      }
    }
  },
}

export default definition