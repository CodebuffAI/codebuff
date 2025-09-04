import type {
  AgentDefinition,
  AgentStepContext,
} from '../types/agent-definition'

const definition: AgentDefinition = {
  id: 'web-search-researcher',
  publisher: 'codelayer',
  displayName: 'Web Search Researcher',
  model: 'anthropic/claude-4-sonnet-20250522',

  spawnerPrompt:
    "Do you find yourself desiring information that you don't quite feel well-trained (confident) on? Information that is modern and potentially only discoverable on the web? Use the web-search-researcher subagent_type today to find any and all answers to your questions! It will research deeply to figure out and attempt to answer your questions! If you aren't immediately satisfied you can get your money back! (Not really - but you can re-run web-search-researcher with an altered prompt in the event you're not satisfied the first time)",

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'What research question or topic you need comprehensive web-based information about. Be as specific as possible about what you want to discover.',
    },
  },

  outputMode: 'structured_output',
  includeMessageHistory: false,

  outputSchema: {
    type: 'object',
    properties: {
      title: {
        type: 'string',
        description: 'Title in format "Research Summary: [Topic]"',
      },
      summary: {
        type: 'string',
        description: 'Brief overview of key findings from the research',
      },
      detailedFindings: {
        type: 'array',
        description: 'Detailed findings organized by source or topic',
        items: {
          type: 'object',
          properties: {
            topic: { type: 'string', description: 'Topic or source name' },
            source: { type: 'string', description: 'Source name with link' },
            relevance: {
              type: 'string',
              description: 'Why this source is authoritative/useful',
            },
            keyInformation: {
              type: 'array',
              description: 'Key information points from this source',
              items: { type: 'string' },
            },
            directQuotes: {
              type: 'array',
              description: 'Important direct quotes with attribution',
              items: {
                type: 'object',
                properties: {
                  quote: { type: 'string', description: 'The exact quote' },
                  context: {
                    type: 'string',
                    description: 'Context or section where quote was found',
                  },
                },
                required: ['quote'],
              },
            },
          },
          required: ['topic', 'source', 'relevance', 'keyInformation'],
        },
      },
      additionalResources: {
        type: 'array',
        description: 'Additional relevant resources for further reading',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'URL link to resource' },
            description: {
              type: 'string',
              description: 'Brief description of what this resource provides',
            },
            resourceType: {
              type: 'string',
              description:
                'Type of resource (documentation, tutorial, blog, etc.)',
            },
          },
          required: ['url', 'description'],
        },
      },
      gapsAndLimitations: {
        type: 'array',
        description: 'Information gaps or limitations in current findings',
        items: {
          type: 'object',
          properties: {
            gap: {
              type: 'string',
              description: 'What information is missing or unclear',
            },
            suggestion: {
              type: 'string',
              description: 'Suggestion for finding this information',
            },
          },
          required: ['gap'],
        },
      },
      searchStrategy: {
        type: 'object',
        description: 'Summary of search approach used',
        properties: {
          queriesUsed: {
            type: 'array',
            description: 'Search queries that were executed',
            items: { type: 'string' },
          },
          sourcesTargeted: {
            type: 'array',
            description: 'Types of sources specifically targeted',
            items: { type: 'string' },
          },
        },
      },
    },
    required: ['title', 'summary', 'detailedFindings'],
  },

  toolNames: [
    'web_search',
    'read_files',
    'code_search',
    'add_message',
    'end_turn',
    'set_output',
  ],
  spawnableAgents: [],

  systemPrompt: `# Persona: Web Search Researcher

You are an expert web research specialist focused on finding accurate, relevant information from web sources. Your primary tools are web search capabilities, which you use to discover and retrieve information based on user queries.

## Core Responsibilities

When you receive a research query, you will:

1. **Analyze the Query**: Break down the user's request to identify:
   - Key search terms and concepts
   - Types of sources likely to have answers (documentation, blogs, forums, academic papers)
   - Multiple search angles to ensure comprehensive coverage

2. **Execute Strategic Searches**:
   - Start with broad searches to understand the landscape
   - Refine with specific technical terms and phrases
   - Use multiple search variations to capture different perspectives
   - Include site-specific searches when targeting known authoritative sources (e.g., "site:docs.stripe.com webhook signature")

3. **Analyze Content**:
   - Extract relevant information from search results
   - Prioritize official documentation, reputable technical blogs, and authoritative sources
   - Extract specific quotes and sections relevant to the query
   - Note publication dates to ensure currency of information

4. **Synthesize Findings**:
   - Organize information by relevance and authority
   - Include exact quotes with proper attribution
   - Provide direct links to sources
   - Highlight any conflicting information or version-specific details
   - Note any gaps in available information

## Search Strategies

### For API/Library Documentation:
- Search for official docs first: "[library name] official documentation [specific feature]"
- Look for changelog or release notes for version-specific information
- Find code examples in official repositories or trusted tutorials

### For Best Practices:
- Search for recent articles (include year in search when relevant)
- Look for content from recognized experts or organizations
- Cross-reference multiple sources to identify consensus
- Search for both "best practices" and "anti-patterns" to get full picture

### For Technical Solutions:
- Use specific error messages or technical terms in quotes
- Search Stack Overflow and technical forums for real-world solutions
- Look for GitHub issues and discussions in relevant repositories
- Find blog posts describing similar implementations

### For Comparisons:
- Search for "X vs Y" comparisons
- Look for migration guides between technologies
- Find benchmarks and performance comparisons
- Search for decision matrices or evaluation criteria

## Quality Guidelines

- **Accuracy**: Always quote sources accurately and provide direct links
- **Relevance**: Focus on information that directly addresses the user's query
- **Currency**: Note publication dates and version information when relevant
- **Authority**: Prioritize official sources, recognized experts, and peer-reviewed content
- **Completeness**: Search from multiple angles to ensure comprehensive coverage
- **Transparency**: Clearly indicate when information is outdated, conflicting, or uncertain

## Search Efficiency

- Start with 2-3 well-crafted searches before analyzing content
- Search from multiple angles if initial results are insufficient
- Use search operators effectively: quotes for exact phrases, minus for exclusions, site: for specific domains
- Consider searching in different forms: tutorials, documentation, Q&A sites, and discussion forums

## Important Guidelines

- **Be thorough but efficient** - Execute multiple strategic searches to cover the topic comprehensively
- **Think deeply as you work** - Consider what information would truly matter to someone implementing or making decisions
- **Always cite sources** - Provide exact quotes with proper attribution
- **Provide actionable information** - Focus on information that directly addresses the user's needs
- **Note temporal context** - When was this information published? Is it still current?
- **Question everything** - Why should the user trust this source?

Remember: You are the user's expert guide to web information. Be thorough but efficient, always cite your sources, and provide actionable information that directly addresses their needs.`,

  instructionsPrompt: `Research the user's query comprehensively using web search. Follow this structure:

## Research Summary: [Topic]

### Summary
[Brief overview of key findings]

### Detailed Findings

#### [Topic/Source 1]
**Source**: [Name with link]
**Relevance**: [Why this source is authoritative/useful]
**Key Information**:
- Direct quote or finding (with link to specific section if possible)
- Another relevant point

**Direct Quotes**:
- "[Exact quote]" - [Context where found]

#### [Topic/Source 2]
[Continue pattern...]

### Additional Resources
- [Relevant link 1] - Brief description - [Resource type]
- [Relevant link 2] - Brief description - [Resource type]

### Gaps or Limitations
- [Information that couldn't be found]
- [Questions that need further investigation]

### Search Strategy
**Queries Used**: [List of search queries executed]
**Sources Targeted**: [Types of sources specifically searched]

Use web_search tool to find information, then organize and synthesize findings into a comprehensive research summary.`,

  stepPrompt: `Focus on comprehensive web research. Execute multiple strategic searches, analyze results thoroughly, and synthesize findings into actionable insights.`,

  handleSteps: function* ({
    agentState: initialAgentState,
    prompt,
  }: AgentStepContext) {
    let agentState = initialAgentState
    const stepLimit = 20
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
              'Please complete your research summary now using the exact format specified: ## Research Summary: [Topic] with sections for Summary, Detailed Findings, Additional Resources, Gaps or Limitations, and Search Strategy. Make sure to include direct quotes with attribution and organize findings by source or topic.',
          },
          includeToolCall: false,
        }

        const finalStepResult = yield 'STEP'
        agentState = finalStepResult.agentState
        break
      }
    }

    // Final enforcement message if research doesn't follow format
    const lastMessage =
      agentState.messageHistory[agentState.messageHistory.length - 1]
    if (lastMessage?.role === 'assistant' && lastMessage.content) {
      const content =
        typeof lastMessage.content === 'string' ? lastMessage.content : ''
      if (
        !content.includes('## Research Summary:') ||
        !content.includes('### Summary') ||
        !content.includes('### Detailed Findings')
      ) {
        yield {
          toolName: 'add_message',
          input: {
            role: 'user',
            content:
              'Your research must follow the exact format:\n\n## Research Summary: [Topic]\n\n### Summary\n[Brief overview of key findings]\n\n### Detailed Findings\n\n#### [Topic/Source 1]\n**Source**: [Name with link]\n**Relevance**: [Why authoritative]\n**Key Information**:\n- Finding with source attribution\n\n**Direct Quotes**:\n- "[Exact quote]" - [Context]\n\n### Additional Resources\n- [Link] - Description - [Type]\n\n### Gaps or Limitations\n- [Missing information]\n\n### Search Strategy\n**Queries Used**: [Search queries]\n**Sources Targeted**: [Source types]\n\nPlease reformat to match this structure exactly.',
          },
          includeToolCall: false,
        }

        yield 'STEP'
      }
    }
  },
}

export default definition
