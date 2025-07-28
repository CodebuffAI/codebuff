import { AgentState } from '@codebuff/common/types/session-state'
import { FileTreeNode, ProjectFileContext } from '@codebuff/common/util/file'
import { describe, expect, it } from 'bun:test'

import { DynamicAgentTemplate } from '@codebuff/common/types/dynamic-agent-template'
import { getAllAgentTemplates } from '../templates/agent-registry'
import { collectParentInstructions } from '../templates/strings'

// Helper to create a mock ProjectFileContext
const createMockFileContext = (
  agentTemplates: Record<string, DynamicAgentTemplate>
): ProjectFileContext => ({
  projectRoot: '/test',
  cwd: '/test',
  knowledgeFiles: {},
  userKnowledgeFiles: {},
  agentTemplates,
  fileTree: [
    {
      type: 'directory',
      name: 'test',
      children: [],
      filePath: '/test',
    } as FileTreeNode,
  ],
  fileTokenScores: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/test',
    cpus: 1,
  },
})

describe('Parent Instructions Injection', () => {
  it('should inject parent instructions into instructionsPrompt', async () => {
    // Mock file context with agent templates
    const fileContext = createMockFileContext({
      'knowledge-keeper': {
        version: '1.0.0',
        id: 'knowledge-keeper',
        displayName: 'Knowledge Keeper',
        override: false,
        parentPrompt: 'Test agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        parentInstructions: {
          researcher:
            'Spawn knowledge-keeper when you find documentation gaps.',
          file_picker: 'Spawn knowledge-keeper when you discover missing docs.',
        },
        systemPrompt: 'You are a test agent.',
        instructionsPrompt: 'Process the user request.',
        stepPrompt: 'Continue processing.',
      },
      researcher: {
        version: '1.0.0',
        id: 'researcher',
        displayName: 'Researcher',
        override: false,
        parentPrompt: 'Research agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        systemPrompt: 'You are a researcher.',
        instructionsPrompt: 'Research the topic.',
        stepPrompt: 'Continue research.',
      },
    })

    // Initialize the registry
    const { agentRegistry } = await getAllAgentTemplates({ fileContext })

    // Get the researcher template
    const researcherTemplate = agentRegistry['researcher']
    expect(researcherTemplate).toBeDefined()

    // Create mock agent state
    const agentState: AgentState = {
      agentId: 'test-agent',
      agentType: 'researcher',
      agentContext: {},
      subagents: [],
      messageHistory: [],
      stepsRemaining: 10,
      output: undefined,
    }

    // Test parent instructions collection directly
    const parentInstructions = await collectParentInstructions(
      'researcher',
      agentRegistry
    )

    // Verify that parent instructions are collected
    expect(parentInstructions).toHaveLength(1)
    expect(parentInstructions[0]).toBe(
      'Spawn knowledge-keeper when you find documentation gaps.'
    )
  })

  it('should not inject parent instructions when none exist', async () => {
    // Mock file context with agent templates without parentInstructions
    const fileContext = createMockFileContext({
      researcher: {
        version: '1.0.0',
        id: 'researcher',
        override: false,
        displayName: 'Researcher',
        parentPrompt: 'Research agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        systemPrompt: 'You are a researcher.',
        instructionsPrompt: 'Research the topic.',
        stepPrompt: 'Continue research.',
      },
    })

    // Initialize the registry
    const { agentRegistry } = await getAllAgentTemplates({ fileContext })

    // Get the researcher template
    const researcherTemplate = agentRegistry['researcher']
    expect(researcherTemplate).toBeDefined()

    // Test parent instructions collection directly
    const parentInstructions = await collectParentInstructions(
      'researcher',
      agentRegistry
    )

    // Verify that no parent instructions are collected
    expect(parentInstructions).toHaveLength(0)
  })

  it('should handle multiple agents with instructions for the same target', async () => {
    // Mock file context with multiple agents having instructions for researcher
    const fileContext = createMockFileContext({
      'knowledge-keeper': {
        version: '1.0.0',
        id: 'knowledge-keeper',
        displayName: 'Knowledge Keeper',
        override: false,
        parentPrompt: 'Test agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        parentInstructions: {
          researcher: 'First instruction for researcher.',
        },
        systemPrompt: 'You are a test agent.',
        instructionsPrompt: 'Process the user request.',
        stepPrompt: 'Continue processing.',
      },
      planner: {
        version: '1.0.0',
        id: 'planner',
        displayName: 'Planner',
        override: false,
        parentPrompt: 'Planning agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        parentInstructions: {
          researcher: 'Second instruction for researcher.',
        },
        systemPrompt: 'You are a planner.',
        instructionsPrompt: 'Plan the task.',
        stepPrompt: 'Continue planning.',
      },
      researcher: {
        version: '1.0.0',
        id: 'researcher',
        displayName: 'Researcher',
        override: false,
        parentPrompt: 'Research agent',
        model: 'anthropic/claude-4-sonnet-20250522',
        outputMode: 'last_message',
        includeMessageHistory: false,
        toolNames: ['end_turn'],
        spawnableAgents: [],
        systemPrompt: 'You are a researcher.',
        instructionsPrompt: 'Research the topic.',
        stepPrompt: 'Continue research.',
      },
    })

    // Initialize the registry
    const { agentRegistry } = await getAllAgentTemplates({ fileContext })

    // Get the researcher template
    const researcherTemplate = agentRegistry['researcher']
    expect(researcherTemplate).toBeDefined()

    // Test parent instructions collection directly
    const parentInstructions = await collectParentInstructions(
      'researcher',
      agentRegistry
    )

    // Verify that both parent instructions are collected
    expect(parentInstructions).toHaveLength(2)
    expect(parentInstructions).toContain('First instruction for researcher.')
    expect(parentInstructions).toContain('Second instruction for researcher.')
  })
})
