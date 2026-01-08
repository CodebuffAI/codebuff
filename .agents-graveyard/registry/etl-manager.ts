import type {
  AgentDefinition,
  ToolCall,
} from '../../agents/types/agent-definition'

/**
 * ETL Manager Agent
 *
 * Coordinates the ETL pipeline using handleSteps for sequential execution.
 * A lightweight shim that spawns extract → transform → load in sequence.
 */

const agent: AgentDefinition = {
  id: 'etl-manager',
  displayName: 'ETL Pipeline Manager',
  model: 'openai/gpt-5.1',
  publisher: 'brandon',

  toolNames: ['spawn_agents', 'think_deeply', 'add_message'],

  outputMode: 'last_message',
  stepPrompt: '',
  includeMessageHistory: true,

  spawnableAgents: ['extract-agent', 'transform-agent', 'load-agent'],

  handleSteps: function* ({ prompt, params }) {
    // Step 1: Generate context-aware prompt for extract agent
    const extractPrompt = `Analyzing user request "${prompt}" to generate optimal extraction strategy. Consider: data domain (${params?.domain || 'unknown'}), specific search terms needed, target sources, and query refinement for maximum relevance.`

    const { toolResult: extractResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'extract-agent',
            prompt: extractPrompt,
            params: params?.extractParams || {},
          },
        ],
      },
    } satisfies ToolCall
    if (!extractResults || extractResults.length === 0) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content: 'Extract step failed.',
        },
      } satisfies ToolCall
      return
    }
    const extractResult =
      extractResults[0]?.type === 'json'
        ? extractResults[0].value
        : extractResults[0]

    // Step 2: Generate context-aware prompt for transform agent
    const transformPrompt = `Processing extracted data from previous step. Need to transform raw data into canonical schema. Consider: data quality, normalization needs, deduplication strategy, and enrichment opportunities based on extracted content.`

    const { toolResult: transformResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'transform-agent',
            prompt: transformPrompt,
            params: {
              ...params?.transformParams,
              extractResult: extractResult,
            },
          },
        ],
      },
    } satisfies ToolCall
    if (!transformResults || transformResults.length === 0) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content: 'Transform step failed.',
        },
      } satisfies ToolCall
      return
    }
    const transformResult =
      transformResults[0]?.type === 'json'
        ? transformResults[0].value
        : transformResults[0]

    // Step 3: Generate context-aware prompt for load agent
    const loadPrompt = `Final filtering and ranking phase for user request "${prompt}". Need to apply user constraints, score relevance, and rank results. Consider: user preferences, contextual relevance, quality metrics, and practical constraints.`

    const { toolResult: loadResults } = yield {
      toolName: 'spawn_agents',
      input: {
        agents: [
          {
            agent_type: 'load-agent',
            prompt: loadPrompt,
            params: {
              ...params?.loadParams,
              transformResult: transformResult,
            },
          },
        ],
      },
    } satisfies ToolCall
    if (!loadResults || loadResults.length === 0) {
      yield {
        toolName: 'add_message',
        input: {
          role: 'user',
          content: 'Load step failed.',
        },
      } satisfies ToolCall
      return
    }
    const loadResult =
      loadResults[0]?.type === 'json' ? loadResults[0].value : loadResults[0]

    // Return final ETL results
    yield {
      toolName: 'add_message',
      input: {
        role: 'user',
        content:
          typeof loadResult === 'string'
            ? loadResult
            : JSON.stringify(loadResult),
      },
    } satisfies ToolCall
  },

  inputSchema: {
    prompt: {
      type: 'string',
      description:
        'The data processing request to execute through ETL pipeline',
    },
    params: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          description:
            'Data domain for ETL processing, e.g. places, events, projects',
        },
        extractParams: {
          type: 'object',
          description: 'Any special parameters for extract agent',
        },
        transformParams: {
          type: 'object',
          description: 'Any special parameters for transform agent',
        },
        loadParams: {
          type: 'object',
          description: 'Any special parameters for load agent',
        },
      },
    },
  },

  systemPrompt:
    'You are an ETL pipeline manager that coordinates sequential data processing through extract, transform, and load stages.',

  spawnerPrompt:
    'Use this agent to execute a complete ETL pipeline for data processing requests',

  instructionsPrompt: '',
}

export default agent
