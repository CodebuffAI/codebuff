import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import os from 'os'
import path from 'path'

import { validateAgents } from '@codebuff/sdk'
import { describe, test, expect, beforeEach, afterEach, mock } from 'bun:test'

import { setProjectRoot, getProjectRoot } from '../../project-files'
import { loadAgentDefinitions } from '../../utils/load-agent-definitions'
import {
  findAgentsDirectory,
  __resetLocalAgentRegistryForTests,
} from '../../utils/local-agent-registry'

const MODEL_NAME = 'anthropic/claude-sonnet-4'

const writeAgentFile = (
  agentsDir: string,
  fileName: string,
  contents: string,
) => writeFileSync(path.join(agentsDir, fileName), contents, 'utf8')

describe('Local Agent Integration', () => {
  let tempDir: string
  let agentsDir: string
  let originalCwd: string
  let originalProjectRoot: string | undefined

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'codebuff-agents-'))
    originalCwd = process.cwd()
    setProjectRoot(process.cwd())
    originalProjectRoot = getProjectRoot()

    process.chdir(tempDir)
    setProjectRoot(tempDir)
    __resetLocalAgentRegistryForTests()

    agentsDir = path.join(tempDir, '.agents')
  })

  afterEach(() => {
    process.chdir(originalCwd)
    setProjectRoot(originalProjectRoot ?? originalCwd)
    __resetLocalAgentRegistryForTests()
    rmSync(tempDir, { recursive: true, force: true })
    mock.restore()
  })

  test('handles missing .agents directory gracefully', () => {
    expect(findAgentsDirectory()).toBeNull()

    const definitions = loadAgentDefinitions()
    expect(definitions).toHaveLength(0)
  })

  test('handles empty .agents directory', () => {
    mkdirSync(agentsDir, { recursive: true })

    expect(findAgentsDirectory()).toBe(agentsDir)
    expect(loadAgentDefinitions()).toHaveLength(0)
  })

  test('skips files lacking displayName/id metadata', () => {
    mkdirSync(agentsDir, { recursive: true })
    writeAgentFile(
      agentsDir,
      'no-meta.ts',
      `export const nothing = { instructions: 'noop' }`,
    )

    expect(loadAgentDefinitions()).toHaveLength(0)
  })

  test('excludes definitions missing required fields', () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'valid.ts',
      `
        export default {
          id: 'valid-agent',
          displayName: 'Valid Agent',
          model: '${MODEL_NAME}',
          instructions: 'Do helpful work'
        }
      `,
    )

    writeAgentFile(
      agentsDir,
      'missing-model.ts',
      `
        export default {
          id: 'incomplete-agent',
          displayName: 'Incomplete Agent',
          instructions: 'Should be filtered out'
        }
      `,
    )

    const definitions = loadAgentDefinitions()
    expect(definitions).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 'valid-agent' })]),
    )
    expect(
      definitions.find((agent) => agent.id === 'incomplete-agent'),
    ).toBeUndefined()
  })

  test('reports duplicate agent ids', async () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'dup-one.ts',
      `
        export default {
          id: 'duplicate-id',
          displayName: 'Agent One',
          model: '${MODEL_NAME}',
          instructions: 'First duplicate'
        }
      `,
    )

    writeAgentFile(
      agentsDir,
      'dup-two.ts',
      `
        export default {
          id: 'duplicate-id',
          displayName: 'Agent Two',
          model: '${MODEL_NAME}',
          instructions: 'Second duplicate'
        }
      `,
    )

    const definitions = loadAgentDefinitions()
    const validation = await validateAgents(definitions, { remote: false })

    expect(validation.success).toBe(false)
    expect(
      validation.validationErrors.some((error) =>
        error.message.includes('Duplicate'),
      ),
    ).toBe(true)
  })

  test('continues when agent module throws on require', () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'bad.ts',
      `
        throw new Error('intentional require failure')
      `,
    )

    writeAgentFile(
      agentsDir,
      'healthy.ts',
      `
        export default {
          id: 'healthy',
          displayName: 'Healthy Agent',
          model: '${MODEL_NAME}',
          instructions: 'Loads fine'
        }
      `,
    )

    const definitions = loadAgentDefinitions()
    expect(definitions).toHaveLength(1)
    expect(definitions[0].id).toBe('healthy')
  })

  test('ignores files without default export', () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'named-export.ts',
      `
        export const agent = {
          id: 'named-agent',
          displayName: 'Named Agent',
          model: '${MODEL_NAME}',
          instructions: 'Not default'
        }
      `,
    )

    expect(loadAgentDefinitions()).toHaveLength(0)
  })

  test('reloads handleSteps after source edits', () => {
    mkdirSync(agentsDir, { recursive: true })

    const agentPath = path.join(agentsDir, 'dynamic.ts')

    const writeAgentWithDisplayName = (displayName: string) =>
      writeFileSync(
        agentPath,
        `
          export default {
            id: 'dynamic-agent',
            displayName: '${displayName}',
            model: '${MODEL_NAME}',
            instructions: 'Check for hot reload',
            handleSteps: function* () { yield 'STEP' }
          }
        `,
        'utf8',
      )

    writeAgentWithDisplayName('First Name')
    let definitions = loadAgentDefinitions()
    expect(definitions[0]?.displayName).toBe('First Name')

    writeAgentWithDisplayName('Updated Name')
    definitions = loadAgentDefinitions()
    expect(definitions[0]?.displayName).toBe('Updated Name')
  })

  test('discovers nested agent directories', () => {
    const nestedDir = path.join(agentsDir, 'level', 'deeper')
    mkdirSync(nestedDir, { recursive: true })

    writeAgentFile(
      nestedDir,
      'nested.ts',
      `
        export default {
          id: 'nested-agent',
          displayName: 'Nested Agent',
          model: '${MODEL_NAME}',
          instructions: 'Nested structure'
        }
      `,
    )

    const definitions = loadAgentDefinitions()
    expect(definitions).toHaveLength(1)
    expect(definitions[0].id).toBe('nested-agent')
  })

  test('ignores non-TypeScript artifacts', () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'real.ts',
      `
        export default {
          id: 'real-agent',
          displayName: 'Real Agent',
          model: '${MODEL_NAME}',
          instructions: 'Legitimate agent'
        }
      `,
    )
    writeFileSync(path.join(agentsDir, 'ignored.js'), 'console.log("noop")')
    writeFileSync(path.join(agentsDir, 'ignored.d.ts'), 'export {}')

    const definitions = loadAgentDefinitions()
    expect(definitions).toHaveLength(1)
    expect(definitions[0].id).toBe('real-agent')
  })

  test('surfaces validation errors to UI logic', async () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'invalid-schema.ts',
      `
        export default {
          id: 'invalid-schema',
          displayName: 'Invalid Schema Agent',
          model: '${MODEL_NAME}',
          instructions: 'Uses schema without enabling structured output',
          outputSchema: {
            type: 'object',
            properties: {
              summary: { type: 'string' }
            }
          }
        }
      `,
    )

    const definitions = loadAgentDefinitions()
    const result = await validateAgents(definitions, { remote: false })

    expect(result.success).toBe(false)
    expect(
      result.validationErrors
        .map((error) => error.message)
        .join('\n')
        .toLowerCase(),
    ).toContain('structured_output')
  })

  test('loads agent definitions without auth', () => {
    mkdirSync(agentsDir, { recursive: true })

    writeAgentFile(
      agentsDir,
      'valid.ts',
      `
        export default {
          id: 'authless-agent',
          displayName: 'Authless Agent',
          model: '${MODEL_NAME}',
          instructions: 'Agent used when auth is missing'
        }
      `,
    )

    const definitions = loadAgentDefinitions()
    expect(definitions).toHaveLength(1)
    expect(definitions[0].id).toBe('authless-agent')
  })
})
