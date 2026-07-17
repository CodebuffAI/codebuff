import { TEST_USER_ID } from '@codebuff/common/old-constants'
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import { assistantMessage } from '@codebuff/common/util/messages'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'
import { z } from 'zod/v4'

import { mockFileContext } from './test-utils'
import * as runAgentStep from '../run-agent-step'
import { handleSpawnAgentInline } from '../tools/handlers/tool/spawn-agent-inline'
import {
  BASE_AGENT_IDS,
  buildSpawnParamsWithHandoff,
  deriveSpawnTemplateCapabilities,
  getMatchingSpawn,
  isBaseAgent,
  normalizeSpawnAgentType,
  toolNotAgentError,
  validateAgentInput,
} from '../tools/handlers/tool/spawn-agent-utils'
import { handleSpawnAgents } from '../tools/handlers/tool/spawn-agents'

import type { CodebuffToolCall } from '@codebuff/common/tools/list'
import type { AgentTemplate } from '@codebuff/common/types/agent-template'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

describe('Spawn Agents Permissions', () => {
  let handleSpawnAgentsBaseParams: ParamsExcluding<
    typeof handleSpawnAgents,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >
  let handleSpawnAgentInlineBaseParams: ParamsExcluding<
    typeof handleSpawnAgentInline,
    'agentState' | 'agentTemplate' | 'localAgentTemplates' | 'toolCall'
  >

  const createMockAgent = (
    id: string,
    spawnableAgents: string[] = [],
  ): AgentTemplate => ({
    id,
    displayName: `Mock ${id}`,
    outputMode: 'last_message' as const,
    inputSchema: {
      prompt: {
        safeParse: () => ({ success: true }),
      } as unknown as AgentTemplate['inputSchema']['prompt'],
    },
    spawnerPrompt: '',
    model: '',
    includeMessageHistory: true,
    inheritParentSystemPrompt: false,
    mcpServers: {},
    toolNames: [],
    spawnableAgents,
    systemPrompt: '',
    instructionsPrompt: '',
    stepPrompt: '',
  })

  beforeEach(() => {
    handleSpawnAgentsBaseParams = {
      ...TEST_AGENT_RUNTIME_IMPL,
      ancestorRunIds: [],
      clientSessionId: 'test-session',
      fileContext: mockFileContext,
      fingerprintId: 'test-fingerprint',
      previousToolCallFinished: Promise.resolve(),
      repoId: undefined,
      repoUrl: undefined,
      sendSubagentChunk: mock(() => {}),
      signal: new AbortController().signal,
      system: 'Test system prompt',
      userId: TEST_USER_ID,
      userInputId: 'test-input',
      writeToClient: () => {},
    }
    handleSpawnAgentInlineBaseParams = {
      ...handleSpawnAgentsBaseParams,
      tools: {},
    }
    spyOn(runAgentStep, 'loopAgentSteps').mockImplementation(
      async (options) => ({
        agentState: {
          ...options.agentState,
          messageHistory: [assistantMessage('Mock agent response')],
        },
        output: {
          type: 'lastMessage',
          value: [assistantMessage('Mock agent response')],
        },
      }),
    )
  })

  afterEach(() => {
    mock.restore()
  })

  it('matches underscored agent names to hyphenated spawnable agents', () => {
    expect(getMatchingSpawn(['file-picker'], 'file_picker')).toBe('file-picker')
    expect(
      getMatchingSpawn(['openbuff/file-picker@1.0.0'], 'file_picker'),
    ).toBe('openbuff/file-picker@1.0.0')
  })

  it('corrects the common code-searcher spawn typo', () => {
    expect(normalizeSpawnAgentType('code-searccher')).toBe('code-searcher')
    expect(getMatchingSpawn(['code-searcher'], 'code-searccher')).toBe(
      'code-searcher',
    )
  })

  it('normalizes string handoff context to a structured object', () => {
    expect(
      buildSpawnParamsWithHandoff({
        agentType: 'editor',
        handoff: { context: 'Follow the existing dashboard pattern.' },
      }),
    ).toEqual({
      handoff: {
        context: { text: 'Follow the existing dashboard pattern.' },
      },
    })
  })

  it('allows spawning when the child agent is spawnable', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('thinker')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents',
      toolCallId: 'spawn-thinker',
      input: { agents: [{ agent_type: 'thinker', prompt: 'Think' }] },
    }

    const { output } = await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { thinker: childAgent },
      toolCall,
    })

    expect(JSON.stringify(output)).toContain('Mock agent response')
  })

  it('derives a discovery question for params-only code-searcher spawns', async () => {
    const parentAgent = createMockAgent('parent', ['code-searcher'])
    const childAgent = createMockAgent('code-searcher')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents',
      toolCallId: 'spawn-code-searcher-without-prompt',
      input: {
        agents: [
          {
            agent_type: 'code-searcher',
            params: {
              searchQueries: [
                {
                  pattern: 'worker|queue|analysis',
                  cwd: 'server/src/__tests__',
                  flags: '-g *.test.ts',
                },
              ],
            },
          },
        ],
      },
    }

    const { output } = await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { 'code-searcher': childAgent },
      toolCall,
    })

    expect(JSON.stringify(output)).toContain('Mock agent response')
    expect(sessionState.mainAgentState.discoveryCoverage?.shards).toHaveLength(
      1,
    )
    expect(
      sessionState.mainAgentState.discoveryCoverage?.shards[0],
    ).toMatchObject({
      agentType: 'code-searcher',
      status: 'completed',
    })
    expect(
      sessionState.mainAgentState.discoveryCoverage?.shards[0].question,
    ).toContain('worker|queue|analysis')
  })

  it('does not retain partial discovery claims when a batch has duplicates', async () => {
    const parentAgent = createMockAgent('parent', ['code-searcher'])
    const childAgent = createMockAgent('code-searcher')
    const sessionState = getInitialSessionState(mockFileContext)
    const duplicate = {
      agent_type: 'code-searcher' as const,
      params: {
        searchQueries: [{ pattern: 'worker', cwd: 'server/src/__tests__' }],
      },
    }

    await expect(
      handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { 'code-searcher': childAgent },
        toolCall: {
          toolName: 'spawn_agents',
          toolCallId: 'spawn-duplicate-code-searchers',
          input: { agents: [duplicate, duplicate] },
        },
      }),
    ).rejects.toThrow('Duplicate discovery shard')

    expect(
      sessionState.mainAgentState.discoveryCoverage?.shards ?? [],
    ).toHaveLength(0)
  })

  it('attenuates terminal authority throughout plan-only spawn ancestry', () => {
    const parentAgent = createMockAgent('base2-plan', ['basher'])
    parentAgent.programmaticConfig = { planOnly: true }
    const childAgent = createMockAgent('basher')
    childAgent.toolNames = ['run_terminal_command']
    childAgent.terminalPermissionProfile = 'workspace-write'

    const derived = deriveSpawnTemplateCapabilities({
      agentTemplate: childAgent,
      parentAgentTemplate: parentAgent,
      handoff: undefined,
      projectRoot: mockFileContext.projectRoot,
    })

    expect(derived.terminalPermissionProfile).toBe('read-only')
    expect(derived.programmaticConfig?.planOnly).toBe(true)
    expect(childAgent.terminalPermissionProfile).toBe('workspace-write')
  })

  it('preserves normal child terminal authority outside plan-only ancestry', () => {
    const parentAgent = createMockAgent('base2', ['basher'])
    const childAgent = createMockAgent('basher')
    childAgent.toolNames = ['run_terminal_command']
    childAgent.terminalPermissionProfile = 'workspace-write'

    const derived = deriveSpawnTemplateCapabilities({
      agentTemplate: childAgent,
      parentAgentTemplate: parentAgent,
      handoff: undefined,
      projectRoot: mockFileContext.projectRoot,
    })

    expect(derived).toBe(childAgent)
    expect(derived.terminalPermissionProfile).toBe('workspace-write')
  })

  it('does not let running background jobs block foreground analysis', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('thinker')
    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.backgroundAgentJobs = Array.from(
      { length: 8 },
      (_, index) => ({
        jobId: `job-${index}`,
        agentType: 'researcher',
        status: 'running' as const,
        startedAt: index,
      }),
    )

    const { output } = await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { thinker: childAgent },
      toolCall: {
        toolName: 'spawn_agents',
        toolCallId: 'spawn-foreground-with-background-full',
        input: { agents: [{ agent_type: 'thinker', prompt: 'Think' }] },
      },
    })

    expect(JSON.stringify(output)).toContain('Mock agent response')
  })

  it('keeps mixed background and foreground reports in input order', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('thinker')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agents'> = {
      toolName: 'spawn_agents',
      toolCallId: 'spawn-mixed',
      input: {
        agents: [
          { agent_type: 'thinker', prompt: 'background', background: true },
          { agent_type: 'thinker', prompt: 'foreground' },
        ],
      },
    }

    const { output } = await handleSpawnAgents({
      ...handleSpawnAgentsBaseParams,
      agentState: sessionState.mainAgentState,
      agentTemplate: parentAgent,
      localAgentTemplates: { thinker: childAgent },
      toolCall,
    })
    const reports = output[0]?.type === 'json' ? output[0].value : undefined
    expect(Array.isArray(reports)).toBe(true)
    expect((reports as any[])[0].value).toMatchObject({ background: true })
    expect(JSON.stringify((reports as any[])[1].value)).toContain(
      'Mock agent response',
    )
  })

  it('rejects inline spawning when the child agent is not spawnable', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('reviewer')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall: CodebuffToolCall<'spawn_agent_inline'> = {
      toolName: 'spawn_agent_inline',
      toolCallId: 'spawn-reviewer',
      input: { agent_type: 'reviewer', prompt: 'Review' },
    }

    await expect(
      handleSpawnAgentInline({
        ...handleSpawnAgentInlineBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { reviewer: childAgent },
        toolCall,
      }),
    ).rejects.toThrow('is not allowed to spawn child agent type reviewer')
  })

  it('rejects spawn batches above the sibling fan-out limit', async () => {
    const parentAgent = createMockAgent('parent', ['thinker'])
    const childAgent = createMockAgent('thinker')
    const sessionState = getInitialSessionState(mockFileContext)
    const toolCall = {
      toolName: 'spawn_agents',
      toolCallId: 'spawn-too-many',
      input: {
        agents: Array.from({ length: 9 }, (_, index) => ({
          agent_type: 'thinker',
          prompt: `task ${index}`,
        })),
      },
    } as CodebuffToolCall<'spawn_agents'>

    await expect(
      handleSpawnAgents({
        ...handleSpawnAgentsBaseParams,
        agentState: sessionState.mainAgentState,
        agentTemplate: parentAgent,
        localAgentTemplates: { thinker: childAgent },
        toolCall,
      }),
    ).rejects.toThrow('at most 8 agents')
  })
})

describe('base-agent spawn helpers', () => {
  it('exposes the canonical set of base agent ids', () => {
    // Guard against accidental additions/removals — runtime spawn-permission
    // checks and the tool-executor pre-validation block must agree.
    expect([...BASE_AGENT_IDS].sort()).toEqual([
      'base',
      'base-experimental',
      'base-free',
      'base-max',
    ])
  })

  it('isBaseAgent returns true for every entry in BASE_AGENT_IDS', () => {
    for (const id of BASE_AGENT_IDS) {
      expect(isBaseAgent(id)).toBe(true)
    }
  })

  it('isBaseAgent returns false for non-base agents and arbitrary strings', () => {
    expect(isBaseAgent('thinker')).toBe(false)
    expect(isBaseAgent('reviewer')).toBe(false)
    expect(isBaseAgent('file-picker')).toBe(false)
    expect(isBaseAgent('base-fork')).toBe(false)
    expect(isBaseAgent('Base')).toBe(false) // case-sensitive
    expect(isBaseAgent('')).toBe(false)
    expect(isBaseAgent(' base')).toBe(false) // whitespace-sensitive
  })

  it('toolNotAgentError formats the canonical tool-vs-agent message', () => {
    expect(toolNotAgentError('read_files')).toBe(
      `"read_files" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
    )
    expect(toolNotAgentError('code_search')).toContain('"code_search"')
    expect(toolNotAgentError('code_search')).toContain(
      'is a tool, not an agent',
    )
  })

  it('toolNotAgentError preserves empty and special-char inputs verbatim', () => {
    // Edge-case inputs are passed through unchanged so the error string stays
    // useful for debugging in logs and reviewer output.
    expect(toolNotAgentError('')).toBe(
      `"" is a tool, not an agent. Call it directly as a tool instead of wrapping it in spawn_agents.`,
    )
    expect(toolNotAgentError('weird name!')).toContain('"weird name!"')
  })
})

describe('editor implementation brief validation', () => {
  const editorTemplate = {
    id: 'editor',
    inputSchema: {
      prompt: {
        safeParse: () => ({ success: true }),
      },
    },
  } as unknown as AgentTemplate

  it('rejects empty, incidental, and placeholder-only sections', () => {
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'editor',
        [
          'Requirements:',
          'N/A',
          'Target files:',
          'N/A',
          'Constraints/non-goals:',
          'N/A',
          'Patterns:',
          'N/A',
          'Risks:',
          'N/A',
        ].join('\n'),
      ),
    ).toThrow('Missing brief fields/sections')
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'editor',
        'The requirements mention target files, constraints, patterns and risks in passing.',
      ),
    ).toThrow('Missing brief fields/sections')
  })

  it('accepts non-empty multiline labeled sections', () => {
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'editor',
        [
          'Requirements:',
          '- Add the behavior.',
          'Target files:',
          '- src/a.ts',
          'Constraints/non-goals:',
          '- Do not change APIs.',
          'Patterns:',
          '- Follow src/b.ts.',
          'Risks:',
          '- Preserve compatibility.',
        ].join('\n'),
      ),
    ).not.toThrow()
  })

  it('accepts non-empty Markdown heading sections without colons', () => {
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'editor',
        [
          '## Requirements',
          '- Add the behavior.',
          '## Target files',
          '- src/a.ts',
          '## Constraints/non-goals',
          '- Do not change APIs.',
          '## Patterns',
          '- Follow src/b.ts.',
          '## Risks',
          '- Preserve compatibility.',
        ].join('\n'),
      ),
    ).not.toThrow()
  })

  it('reports every actually missing editor brief section', () => {
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'editor',
        ['## Requirements', '- Add the requested behavior.'].join('\n'),
      ),
    ).toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          [
            '- Target files',
            '- Constraints/non-goals',
            '- Patterns',
            '- Risks',
          ].join('\n'),
        ),
      }),
    )
  })

  it('adds actionable recovery for required Basher and compatibility snapshot params', () => {
    const basherTemplate = {
      id: 'basher',
      inputSchema: { params: z.object({ command: z.string().min(1) }) },
    } as unknown as AgentTemplate
    expect(() =>
      validateAgentInput(basherTemplate, 'basher', undefined, {}),
    ).toThrow('A command mentioned only in prompt prose is never executed')

    const compatibilityTemplate = {
      id: 'compatibility-reviewer',
      inputSchema: { params: z.object({ snapshot_id: z.string().min(1) }) },
    } as unknown as AgentTemplate
    expect(() =>
      validateAgentInput(
        compatibilityTemplate,
        'compatibility-reviewer',
        'Review compatibility.',
        {},
      ),
    ).toThrow(
      'exact current snapshot fingerprint from get_change_review_bundle',
    )
  })

  it('accepts a concrete prose brief with actionable target files', () => {
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'editor',
        'Implement the IP dashboard in client/src/routes/dashboard.ip.tsx and update client/src/components/dashboard/Sidebar.tsx to add navigation. Follow the existing dashboard component patterns and preserve unrelated routes.',
      ),
    ).not.toThrow()
  })

  it('enforces the editor brief for fully-qualified spawn ids', () => {
    expect(() =>
      validateAgentInput(
        editorTemplate,
        'openbuff/editor@1.0.0',
        'Please make the change.',
      ),
    ).toThrow('Missing brief fields/sections')
  })
})
