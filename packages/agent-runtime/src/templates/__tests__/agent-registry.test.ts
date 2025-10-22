import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { mockModule } from '@codebuff/common/testing/mock-modules'
import { getStubProjectFileContext } from '@codebuff/common/util/file'
import {
  describe,
  expect,
  it,
  beforeEach,
  afterEach,
  spyOn,
  mock,
  beforeAll,
} from 'bun:test'

import {
  getAgentTemplate,
  assembleLocalAgentTemplates,
} from '../agent-registry'

import type { AgentTemplate } from '../types'
import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import type { ProjectFileContext } from '@codebuff/common/util/file'

let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

// Create mock static templates that will be used by the agent registry
const mockStaticTemplates: Record<string, AgentTemplate> = {
  base: {
    id: 'base',
    displayName: 'Base Agent',
    systemPrompt: 'Test',
    instructionsPrompt: 'Test',
    stepPrompt: 'Test',
    mcpServers: {},
    toolNames: ['end_turn'],
    spawnableAgents: [],
    outputMode: 'last_message',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    model: 'anthropic/claude-4-sonnet-20250522',
    spawnerPrompt: 'Test',
    inputSchema: {},
  },
  file_picker: {
    id: 'file_picker',
    displayName: 'File Picker',
    systemPrompt: 'Test',
    instructionsPrompt: 'Test',
    stepPrompt: 'Test',
    mcpServers: {},
    toolNames: ['find_files'],
    spawnableAgents: [],
    outputMode: 'last_message',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    model: 'google/gemini-2.5-flash',
    spawnerPrompt: 'Test',
    inputSchema: {},
  },
}

// We'll spy on the validation functions instead of mocking the entire module

describe('Agent Registry', () => {
  let mockFileContext: ProjectFileContext

  beforeAll(() => {
    // Mock the database module
    mockModule('@codebuff/common/db', () => ({
      default: {
        select: () => ({
          from: () => ({
            where: () => ({
              orderBy: () => ({
                limit: () => Promise.resolve([]),
              }),
              then: (fn: (rows: any[]) => any) => fn([]),
            }),
          }),
        }),
      },
    }))

    // Mock the schema module
    mockModule('@codebuff/common/db/schema', () => ({
      agentConfig: {
        id: 'id',
        publisher_id: 'publisher_id',
        version: 'version',
        major: 'major',
        minor: 'minor',
        patch: 'patch',
        data: 'data',
      },
    }))

    // Mock drizzle-orm
    mockModule('drizzle-orm', () => ({
      and: (...args: any[]) => ({ type: 'and', args }),
      desc: (field: any) => ({ type: 'desc', field }),
      eq: (field: any, value: any) => ({ type: 'eq', field, value }),
    }))
  })

  beforeEach(async () => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
    }

    agentRuntimeImpl.databaseAgentCache.clear()

    mockFileContext = getStubProjectFileContext()

    // Spy on validation functions
    const validationModule = await import(
      '@codebuff/common/templates/agent-validation'
    )
    spyOn(validationModule, 'validateAgents').mockImplementation(
      ({
        agentTemplates = {},
        logger,
      }: {
        agentTemplates?: Record<string, DynamicAgentTemplate>
        logger: Logger
      }) => {
        // Start with static templates (simulating the real behavior)
        const templates: Record<string, AgentTemplate> = {
          ...mockStaticTemplates,
        }
        const validationErrors: any[] = []

        for (const key in agentTemplates) {
          const template = agentTemplates[key]
          if (template.id === 'invalid-agent') {
            validationErrors.push({
              filePath: key,
              message: 'Invalid agent configuration',
            })
            // Don't add invalid agents to templates (this simulates validation failure)
          } else {
            templates[template.id] = template as AgentTemplate
          }
        }

        return { templates, dynamicTemplates: agentTemplates, validationErrors }
      },
    )

    spyOn(validationModule, 'validateSingleAgent').mockImplementation(
      ({ template }: { template: DynamicAgentTemplate; filePath?: string }) => {
        // Check for malformed agents (missing required fields)
        if (
          template.id === 'malformed-agent' ||
          !template.systemPrompt ||
          !template.instructionsPrompt ||
          !template.stepPrompt
        ) {
          return {
            success: false,
            error: 'Invalid agent configuration - missing required fields',
          }
        }
        return {
          success: true,
          agentTemplate: template as AgentTemplate,
        }
      },
    )
  })

  afterEach(() => {
    mock.restore()
  })

  describe('parseAgentId (tested through getAgentTemplate)', () => {
    it('should handle agent IDs without publisher (local agents)', async () => {
      const localAgents = {
        'my-agent': {
          id: 'my-agent',
          displayName: 'My Agent',
          systemPrompt: 'Test',
          instructionsPrompt: 'Test',
          stepPrompt: 'Test',
          mcpServers: {},
          toolNames: ['end_turn'],
          spawnableAgents: [],
          outputMode: 'last_message',
          includeMessageHistory: true,
          inheritParentSystemPrompt: false,
          model: 'anthropic/claude-4-sonnet-20250522',
          spawnerPrompt: 'Test',
          inputSchema: {},
        } as AgentTemplate,
      }

      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'my-agent',
        localAgentTemplates: localAgents,
      })
      expect(result).toBeTruthy()
      expect(result?.id).toBe('my-agent')
    })

    it('should handle agent IDs with publisher but no version', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'publisher/agent-name',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })

    it('should handle agent IDs with publisher and version', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'publisher/agent-name@1.0.0',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })

    it('should return null for invalid agent ID formats', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'invalid/format/with/too/many/slashes',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })
  })

  describe('fetchAgentFromDatabase', () => {
    it('should return null when agent not found in database', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'nonexistent/agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })

    it('should handle database query for specific version', async () => {
      const mockAgentData: AgentTemplate = {
        id: 'test-publisher/test-agent@1.0.0',
        displayName: 'Test Agent',
        systemPrompt: 'Test system prompt',
        instructionsPrompt: 'Test instructions',
        stepPrompt: 'Test step prompt',
        toolNames: ['end_turn'],
        mcpServers: {},
        inputSchema: {},
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Test',
      }

      agentRuntimeImpl = {
        ...agentRuntimeImpl,
        fetchAgentFromDatabase: async () => mockAgentData,
      }

      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-publisher/test-agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(result).toBeTruthy()
      expect(result?.id).toBe('test-publisher/test-agent@1.0.0')
    })
  })

  describe('getAgentTemplate priority order', () => {
    it('should prioritize local agents over database agents', async () => {
      const localAgents = {
        'test-agent': {
          id: 'test-agent',
          displayName: 'Local Test Agent',
          systemPrompt: 'Local system prompt',
          instructionsPrompt: 'Local instructions',
          stepPrompt: 'Local step prompt',
          mcpServers: {},
          toolNames: ['end_turn'],
          spawnableAgents: [],
          outputMode: 'last_message',
          includeMessageHistory: true,
          inheritParentSystemPrompt: false,
          model: 'anthropic/claude-4-sonnet-20250522',
          spawnerPrompt: 'Local test',
          inputSchema: {},
        } as AgentTemplate,
      }

      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-agent',
        localAgentTemplates: localAgents,
      })
      expect(result).toBeTruthy()
      expect(result?.displayName).toBe('Local Test Agent')
    })

    it('should use database cache when available', async () => {
      const mockAgentData: AgentTemplate = {
        id: 'test-publisher/cached-agent@1.0.0',
        displayName: 'Cached Agent',
        systemPrompt: 'Cached system prompt',
        instructionsPrompt: 'Cached instructions',
        stepPrompt: 'Cached step prompt',
        inputSchema: {},
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Cached test',
      }

      const spy = mock(async () => mockAgentData)
      agentRuntimeImpl = {
        ...agentRuntimeImpl,
        fetchAgentFromDatabase: spy,
      }

      // First call - should hit database
      const result1 = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-publisher/cached-agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(result1).toBeTruthy()
      expect(spy).toHaveBeenCalled()

      const spy2 = mock(async () => mockAgentData)
      agentRuntimeImpl = {
        ...agentRuntimeImpl,
        fetchAgentFromDatabase: spy2,
      }

      // Second call - should use cache
      const result2 = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-publisher/cached-agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(result2).toBeTruthy()
      expect(result2?.displayName).toBe('Cached Agent')
      expect(spy2).not.toHaveBeenCalled()
    })
  })

  describe('assembleLocalAgentTemplates', () => {
    it('should merge static and dynamic templates', () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'custom-agent.ts': {
            id: 'custom-agent',
            displayName: 'Custom Agent',
            systemPrompt: 'Custom system prompt',
            instructionsPrompt: 'Custom instructions',
            stepPrompt: 'Custom step prompt',
            toolNames: ['end_turn'],
            spawnableAgents: [],
            outputMode: 'last_message',
            includeMessageHistory: true,
            model: 'anthropic/claude-4-sonnet-20250522',
            spawnerPrompt: 'Custom test',
          },
        },
      }

      const result = assembleLocalAgentTemplates({
        ...agentRuntimeImpl,
        fileContext,
      })

      // Should have dynamic template
      expect(result.agentTemplates).toHaveProperty('custom-agent')
      expect(result.agentTemplates['custom-agent'].displayName).toBe(
        'Custom Agent',
      )

      // Should have no validation errors
      expect(result.validationErrors).toHaveLength(0)
    })

    it('should handle validation errors in dynamic templates', () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {
          'invalid-agent.ts': {
            id: 'invalid-agent',
            displayName: 'Invalid Agent',
            // Missing required fields to trigger validation error
          } as any,
        },
      }

      const result = assembleLocalAgentTemplates({
        ...agentRuntimeImpl,
        fileContext,
      })

      // Should not have invalid template
      expect(result.agentTemplates).not.toHaveProperty('invalid-agent')

      // Should have validation errors
      expect(result.validationErrors.length).toBeGreaterThan(0)
    })

    it('should handle empty agentTemplates', () => {
      const fileContext: ProjectFileContext = {
        ...mockFileContext,
        agentTemplates: {},
      }

      const result = assembleLocalAgentTemplates({
        ...agentRuntimeImpl,
        fileContext,
      })

      // Should have no validation errors
      expect(result.validationErrors).toHaveLength(0)

      // Should return some agent templates (static ones from our mock)
      expect(Object.keys(result.agentTemplates).length).toBeGreaterThan(0)
    })
  })

  describe('clearDatabaseCache', () => {
    it('should clear the database cache', async () => {
      const mockAgentData: AgentTemplate = {
        id: 'test-publisher/cache-test-agent@1.0.0',
        displayName: 'Cache Test Agent',
        systemPrompt: 'Cache test system prompt',
        instructionsPrompt: 'Cache test instructions',
        stepPrompt: 'Cache test step prompt',
        inputSchema: {},
        mcpServers: {},
        toolNames: ['end_turn'],
        spawnableAgents: [],
        outputMode: 'last_message',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        model: 'anthropic/claude-4-sonnet-20250522',
        spawnerPrompt: 'Cache test',
      }

      const selectSpy = mock(async () => mockAgentData)
      agentRuntimeImpl = {
        ...agentRuntimeImpl,
        fetchAgentFromDatabase: selectSpy,
      }

      // First call - should hit database and populate cache
      await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-publisher/cache-test-agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(selectSpy).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-publisher/cache-test-agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(selectSpy).toHaveBeenCalledTimes(1)

      agentRuntimeImpl.databaseAgentCache.clear()

      // Third call - should hit database again after cache clear
      await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'test-publisher/cache-test-agent@1.0.0',
        localAgentTemplates: {},
      })
      expect(selectSpy).toHaveBeenCalledTimes(2)
    })
  })

  describe('edge cases', () => {
    it('should handle empty agent ID', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: '',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })

    it('should handle agent ID with multiple @ symbols', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'publisher/agent@1.0.0@extra',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })

    it('should handle agent ID with only @ symbol', async () => {
      const result = await getAgentTemplate({
        ...agentRuntimeImpl,
        agentId: 'publisher/agent@',
        localAgentTemplates: {},
      })
      expect(result).toBeNull()
    })
  })
})
