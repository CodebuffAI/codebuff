import { spyOn } from 'bun:test'
import z from 'zod/v4'
import type { AgentRuntimeEnvironment } from '@codebuff/agent-runtime'
import type { WebSocket } from 'ws'
import type { AgentTemplate } from '../templates/types'
import type { AgentTemplateType, AgentState } from '@codebuff/common/types/session-state'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

/**
 * Creates mock tool definitions with proper Zod schemas
 */
function createMockToolDefinitions() {
  const toolNames = [
    'read_files',
    'write_file', 
    'end_turn',
    'add_message',
    'set_output',
    'code_search',
    'create_plan',
    'add_subgoal',
    'update_subgoal',
    'find_files',
    'set_messages'
  ]
  
  const definitions: Record<string, any> = {}
  
  for (const toolName of toolNames) {
    definitions[toolName] = {
      toolName,
      endsAgentStep: true,
      parameters: z.object({}), // Basic schema that always passes
    }
  }
  
  return definitions
}

/**
 * Creates mock tool handlers
 */
function createMockToolHandlers() {
  const handlers = {
    set_output: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      // The input for set_output contains all the data that should be set as output
      state.agentState.output = toolCall.input
      return 'Output set successfully'
    },
    end_turn: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return 'Turn ended'
    },
    read_files: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return 'Files read successfully'
    },
    write_file: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return 'File written successfully'
    },
    add_message: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return 'Message added successfully'
    },
    code_search: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return 'Search completed successfully'
    },
    create_plan: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return 'Plan created successfully'
    },
    add_subgoal: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      const input = toolCall.input
      if (!state.agentState.agentContext) {
        state.agentState.agentContext = {}
      }
      state.agentState.agentContext[input.id] = {
        ...input,
        logs: [],
      }
      return 'Subgoal added successfully'
    },
    update_subgoal: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      const input = toolCall.input
      if (state.agentState.agentContext && state.agentState.agentContext[input.id]) {
        state.agentState.agentContext[input.id] = {
          ...state.agentState.agentContext[input.id],
          ...input,
          logs: [...(state.agentState.agentContext[input.id].logs || []), input.log].filter(Boolean),
        }
      }
      return 'Subgoal updated successfully'
    },
    find_files: async ({ toolCall, state }: { toolCall: any, state: any }) => {
      return JSON.stringify({
        files: [
          { path: 'src/auth.ts', relevance: 0.9 },
          { path: 'src/login.ts', relevance: 0.8 },
        ],
      })
    },
  } as const
  
  return handlers
}

/**
 * Creates a mock agent runtime environment for testing
 */
export function createMockAgentRuntimeEnvironment(): AgentRuntimeEnvironment {
  return {
    llm: {
      getAgentStreamFromTemplate: spyOn(
        {} as any,
        'getAgentStreamFromTemplate'
      ).mockImplementation((params: any) => {
        return async function* () {
          yield 'Mock LLM response'
        }
      }) as any,
    },

    io: {
      requestToolCall: spyOn({} as any, 'requestToolCall').mockImplementation(
        async (userInputId: string, toolName: string, input: any) => {
          return {
            success: true,
            output: { type: 'text', value: `Mock ${toolName} result` },
          }
        }
      ) as any,

      requestFiles: spyOn({} as any, 'requestFiles').mockImplementation(
        async () => ({})
      ) as any,

      requestFile: spyOn({} as any, 'requestFile').mockImplementation(
        async () => null
      ) as any,

      onResponseChunk: undefined,
    },

    inputGate: {
      start: spyOn({} as any, 'start').mockImplementation(() => {}) as any,
      check: spyOn({} as any, 'check').mockImplementation(() => true) as any,
      end: spyOn({} as any, 'end').mockImplementation(() => {}) as any,
    },

    tools: {
      definitions: createMockToolDefinitions(),
      handlers: createMockToolHandlers(),
    },

    templates: {
      getAgentTemplate: spyOn({} as any, 'getAgentTemplate').mockImplementation(
        async (agentType: AgentTemplateType, localTemplates: Record<string, AgentTemplate>) => {
          return localTemplates[agentType] || {
            id: agentType,
            displayName: `Mock ${agentType}`,
            spawnerPrompt: 'Mock spawner prompt',
            model: 'claude-3-5-sonnet-20241022',
            inputSchema: {},
            outputMode: 'last_message',
            includeMessageHistory: false,
            toolNames: ['end_turn'],
            spawnableAgents: [],
            systemPrompt: 'Mock system prompt',
            instructionsPrompt: 'Mock instructions prompt',
            stepPrompt: 'Mock step prompt',
          } as AgentTemplate
        }
      ) as any,

      getAgentPrompt: spyOn({} as any, 'getAgentPrompt').mockImplementation(
        async () => 'Mock agent prompt'
      ) as any,
    },

    analytics: {
      trackEvent: spyOn({} as any, 'trackEvent').mockImplementation(() => {}) as any,
      insertTrace: spyOn({} as any, 'insertTrace').mockImplementation(() => {}) as any,
    },

    logger: {
      debug: spyOn({} as any, 'debug').mockImplementation(() => {}) as any,
      info: spyOn({} as any, 'info').mockImplementation(() => {}) as any,
      warn: spyOn({} as any, 'warn').mockImplementation(() => {}) as any,
      error: spyOn({} as any, 'error').mockImplementation(() => {}) as any,
    },

    requestContext: {
      processedRepoId: 'test-repo-id',
    },
  }
}
