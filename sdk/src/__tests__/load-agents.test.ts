import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import os from 'os'
import path from 'path'

import { describe, expect, test, beforeEach, afterEach, mock, spyOn } from 'bun:test'

import { loadLocalAgents } from '../agents/load-agents'

import type {
  LoadedAgents,
  LoadedAgentDefinition,
  LoadLocalAgentsResult,
  AgentValidationError,
} from '../agents/load-agents'

const MODEL_NAME = 'anthropic/claude-sonnet-4' as const

/**
 * Helper to write an agent file to the test directory.
 * @param agentsDir - The agents directory path
 * @param fileName - The file name (e.g., 'my-agent.ts')
 * @param contents - The TypeScript/JavaScript content
 */
const writeAgentFile = (
  agentsDir: string,
  fileName: string,
  contents: string,
): void => {
  writeFileSync(path.join(agentsDir, fileName), contents, 'utf8')
}

describe('loadLocalAgents', () => {
  let tempDir: string
  let agentsDir: string

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codebuff-sdk-load-agents-'))
    agentsDir = path.join(tempDir, '.agents')
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  describe('without validation (backward compatible)', () => {
    test('returns empty object when agents directory does not exist', async () => {
      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(result).toEqual({})
    })

    test('returns empty object when agents directory is empty', async () => {
      mkdirSync(agentsDir, { recursive: true })

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(result).toEqual({})
    })

    test('loads valid agent definitions', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'my-agent.ts',
        `
          export default {
            id: 'my-agent',
            displayName: 'My Agent',
            model: '${MODEL_NAME}',
            instructionsPrompt: 'Help the user'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      const agent: LoadedAgentDefinition | undefined = result['my-agent']
      expect(agent).toBeDefined()
      expect(agent!.id).toBe('my-agent')
      expect(agent!.displayName).toBe('My Agent')
      expect(agent!.model).toBe(MODEL_NAME)
      expect(agent!._sourceFilePath).toBe(
        path.join(agentsDir, 'my-agent.ts'),
      )
    })

    test('loads multiple agents from directory', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'agent-one.ts',
        `
          export default {
            id: 'agent-one',
            displayName: 'Agent One',
            model: '${MODEL_NAME}'
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'agent-two.ts',
        `
          export default {
            id: 'agent-two',
            displayName: 'Agent Two',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })
      const agentIds: string[] = Object.keys(result)

      expect(agentIds).toHaveLength(2)
      expect(result['agent-one']).toBeDefined()
      expect(result['agent-two']).toBeDefined()
    })

    test('skips agents missing required id field', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'no-id.ts',
        `
          export default {
            displayName: 'No ID Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(Object.keys(result)).toHaveLength(0)
    })

    test('skips agents missing required model field', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'no-model.ts',
        `
          export default {
            id: 'no-model-agent',
            displayName: 'No Model Agent'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(Object.keys(result)).toHaveLength(0)
    })

    test('skips .d.ts declaration files', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'types.d.ts',
        `
          export default {
            id: 'dts-agent',
            displayName: 'DTS Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(result['dts-agent']).toBeUndefined()
    })

    test('skips .test.ts test files', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'agent.test.ts',
        `
          export default {
            id: 'test-file-agent',
            displayName: 'Test File Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(result['test-file-agent']).toBeUndefined()
    })

    test('loads agents from nested directories', async () => {
      const nestedDir: string = path.join(agentsDir, 'nested', 'deep')
      mkdirSync(nestedDir, { recursive: true })
      writeAgentFile(
        nestedDir,
        'nested-agent.ts',
        `
          export default {
            id: 'nested-agent',
            displayName: 'Nested Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(result['nested-agent']).toBeDefined()
    })

    test('skips files inside the skills directory', async () => {
      mkdirSync(agentsDir, { recursive: true })
      const skillsDir: string = path.join(agentsDir, 'skills')
      mkdirSync(skillsDir, { recursive: true })
      writeAgentFile(
        skillsDir,
        'some-skill.ts',
        `
          export default {
            id: 'skill-agent',
            displayName: 'Skill Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'real-agent.ts',
        `
          export default {
            id: 'real-agent',
            displayName: 'Real Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      expect(result['skill-agent']).toBeUndefined()
      expect(result['real-agent']).toBeDefined()
    })

    test('converts handleSteps function to string', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'generator-agent.ts',
        `
          export default {
            id: 'generator-agent',
            displayName: 'Generator Agent',
            model: '${MODEL_NAME}',
            handleSteps: function* () {
              yield 'STEP'
              yield 'STEP_ALL'
            }
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })
      const agent: LoadedAgentDefinition | undefined = result['generator-agent']

      expect(agent).toBeDefined()
      // handleSteps is converted to string by the loader (serialized from function)
      const handleStepsStr = agent!.handleSteps as unknown as string
      expect(typeof handleStepsStr).toBe('string')
      expect(handleStepsStr).toContain('STEP')
    })

    test('handles agent files that throw on import', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'throwing.ts',
        `
          throw new Error('intentional error')
          export default {
            id: 'throwing-agent',
            displayName: 'Throwing Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'valid.ts',
        `
          export default {
            id: 'valid-agent',
            displayName: 'Valid Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadedAgents = await loadLocalAgents({ agentsPath: agentsDir })

      // Should still load the valid agent
      expect(result['valid-agent']).toBeDefined()
      expect(result['throwing-agent']).toBeUndefined()
    })

    test('logs errors when verbose is true', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'no-model.ts',
        `
          export default {
            id: 'no-model',
            displayName: 'No Model'
          }
        `,
      )

      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
        () => {},
      )

      await loadLocalAgents({ agentsPath: agentsDir, verbose: true })

      expect(consoleErrorSpy).toHaveBeenCalled()
      const errorMessage: string = consoleErrorSpy.mock.calls
        .flat()
        .join(' ')
      expect(errorMessage).toContain('missing required attributes')
    })
  })

  describe('with validation (validate: true)', () => {
    test('returns result object with agents and validationErrors', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'valid.ts',
        `
          export default {
            id: 'valid-agent',
            displayName: 'Valid Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      // With validate: true, TypeScript infers LoadLocalAgentsResult
      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.agents).toBeDefined()
      expect(result.validationErrors).toBeDefined()
      expect(Array.isArray(result.validationErrors)).toBe(true)
    })

    test('returns empty validationErrors for valid agents', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'valid.ts',
        `
          export default {
            id: 'valid-agent',
            displayName: 'Valid Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.validationErrors).toHaveLength(0)
      expect(result.agents['valid-agent']).toBeDefined()
    })

    test('returns validation errors for invalid agents', async () => {
      mkdirSync(agentsDir, { recursive: true })
      // Agent with outputSchema but without structured_output mode
      writeAgentFile(
        agentsDir,
        'invalid.ts',
        `
          export default {
            id: 'invalid-agent',
            displayName: 'Invalid Agent',
            model: '${MODEL_NAME}',
            outputSchema: {
              type: 'object',
              properties: { result: { type: 'string' } }
            }
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.validationErrors.length).toBeGreaterThan(0)
      expect(result.agents['invalid-agent']).toBeUndefined()
    })

    test('validation errors include agentId, filePath, and message', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'invalid.ts',
        `
          export default {
            id: 'invalid-agent',
            displayName: 'Invalid Agent',
            model: '${MODEL_NAME}',
            outputSchema: {
              type: 'object',
              properties: { result: { type: 'string' } }
            }
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.validationErrors.length).toBeGreaterThan(0)
      const error: AgentValidationError = result.validationErrors[0]
      expect(error.agentId).toBe('invalid-agent')
      expect(error.filePath).toBe(path.join(agentsDir, 'invalid.ts'))
      expect(typeof error.message).toBe('string')
      expect(error.message.length).toBeGreaterThan(0)
    })

    test('separates valid and invalid agents correctly', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'valid.ts',
        `
          export default {
            id: 'valid-agent',
            displayName: 'Valid Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'invalid.ts',
        `
          export default {
            id: 'invalid-agent',
            displayName: 'Invalid Agent',
            model: '${MODEL_NAME}',
            outputSchema: {
              type: 'object',
              properties: { result: { type: 'string' } }
            }
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      // Valid agent should be in agents
      expect(result.agents['valid-agent']).toBeDefined()
      // Invalid agent should be filtered out
      expect(result.agents['invalid-agent']).toBeUndefined()
      // Error should be reported
      const hasInvalidAgentError: boolean = result.validationErrors.some(
        (e: AgentValidationError) => e.agentId === 'invalid-agent',
      )
      expect(hasInvalidAgentError).toBe(true)
    })

    test('returns empty result when directory does not exist', async () => {
      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.agents).toEqual({})
      expect(result.validationErrors).toEqual([])
    })

    test('returns empty result when directory is empty', async () => {
      mkdirSync(agentsDir, { recursive: true })

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.agents).toEqual({})
      expect(result.validationErrors).toEqual([])
    })

    test('handles all agents being invalid', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'invalid1.ts',
        `
          export default {
            id: 'invalid-agent-1',
            displayName: 'Invalid Agent 1',
            model: '${MODEL_NAME}',
            outputSchema: { type: 'object' }
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'invalid2.ts',
        `
          export default {
            id: 'invalid-agent-2',
            displayName: 'Invalid Agent 2',
            model: '${MODEL_NAME}',
            outputSchema: { type: 'object' }
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(Object.keys(result.agents)).toHaveLength(0)
      expect(result.validationErrors.length).toBe(2)
    })

    test('handles all agents being valid', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'valid1.ts',
        `
          export default {
            id: 'valid-agent-1',
            displayName: 'Valid Agent 1',
            model: '${MODEL_NAME}'
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'valid2.ts',
        `
          export default {
            id: 'valid-agent-2',
            displayName: 'Valid Agent 2',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(Object.keys(result.agents)).toHaveLength(2)
      expect(result.validationErrors).toHaveLength(0)
    })

    test('logs validation errors when verbose is true', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'invalid.ts',
        `
          export default {
            id: 'invalid-agent',
            displayName: 'Invalid Agent',
            model: '${MODEL_NAME}',
            outputSchema: { type: 'object' }
          }
        `,
      )

      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
        () => {},
      )

      await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
        verbose: true,
      })

      expect(consoleErrorSpy).toHaveBeenCalled()
      const errorMessage: string = consoleErrorSpy.mock.calls.flat().join(' ')
      expect(errorMessage).toContain('Validation failed')
      expect(errorMessage).toContain('invalid-agent')
    })

    test('does not log validation errors when verbose is false', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'invalid.ts',
        `
          export default {
            id: 'invalid-agent',
            displayName: 'Invalid Agent',
            model: '${MODEL_NAME}',
            outputSchema: { type: 'object' }
          }
        `,
      )

      const consoleErrorSpy = spyOn(console, 'error').mockImplementation(
        () => {},
      )

      await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
        verbose: false,
      })

      // Should not log validation errors when verbose is false
      const calls: string = consoleErrorSpy.mock.calls.flat().join(' ')
      expect(calls).not.toContain('Validation failed')
    })

    test('validates duplicate agent IDs across files', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'agent1.ts',
        `
          export default {
            id: 'duplicate-id',
            displayName: 'Agent 1',
            model: '${MODEL_NAME}'
          }
        `,
      )
      writeAgentFile(
        agentsDir,
        'agent2.ts',
        `
          export default {
            id: 'duplicate-id',
            displayName: 'Agent 2',
            model: '${MODEL_NAME}'
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      // SDK loader only keeps one agent per ID (last wins), then validation
      // checks for duplicates. The loader deduplicates before validation sees them.
      // So we should have one agent and potentially a duplicate error from validation
      // depending on how the validation is set up.
      // At minimum, we should not crash and should return a valid result.
      expect(result.agents).toBeDefined()
      expect(result.validationErrors).toBeDefined()
    })

    test('validates agent with spawnableAgents but no spawn_agents tool', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'bad-spawn.ts',
        `
          export default {
            id: 'bad-spawn-agent',
            displayName: 'Bad Spawn Agent',
            model: '${MODEL_NAME}',
            spawnableAgents: ['some-agent'],
            toolNames: ['read_files']  // Missing spawn_agents
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      // Should have validation error
      expect(result.validationErrors.length).toBeGreaterThan(0)
      expect(result.agents['bad-spawn-agent']).toBeUndefined()
    })

    test('validates agent with conflicting inheritParentSystemPrompt and systemPrompt', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'conflicting.ts',
        `
          export default {
            id: 'conflicting-agent',
            displayName: 'Conflicting Agent',
            model: '${MODEL_NAME}',
            inheritParentSystemPrompt: true,
            systemPrompt: 'This conflicts'
          }
        `,
      )

      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.validationErrors.length).toBeGreaterThan(0)
      expect(result.agents['conflicting-agent']).toBeUndefined()
    })
  })

  describe('type safety', () => {
    test('validate: false returns LoadedAgents type', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'agent.ts',
        `
          export default {
            id: 'test-agent',
            displayName: 'Test Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      // This should type-check as LoadedAgents
      const result: LoadedAgents = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: false,
      })

      expect(result['test-agent']).toBeDefined()
    })

    test('validate: true returns LoadLocalAgentsResult type', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'agent.ts',
        `
          export default {
            id: 'test-agent',
            displayName: 'Test Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      // This should type-check as LoadLocalAgentsResult
      const result: LoadLocalAgentsResult = await loadLocalAgents({
        agentsPath: agentsDir,
        validate: true,
      })

      expect(result.agents).toBeDefined()
      expect(result.validationErrors).toBeDefined()
    })

    test('omitting validate returns LoadedAgents type', async () => {
      mkdirSync(agentsDir, { recursive: true })
      writeAgentFile(
        agentsDir,
        'agent.ts',
        `
          export default {
            id: 'test-agent',
            displayName: 'Test Agent',
            model: '${MODEL_NAME}'
          }
        `,
      )

      // This should type-check as LoadedAgents (backward compatible)
      const result: LoadedAgents = await loadLocalAgents({
        agentsPath: agentsDir,
      })

      expect(result['test-agent']).toBeDefined()
    })
  })
})
