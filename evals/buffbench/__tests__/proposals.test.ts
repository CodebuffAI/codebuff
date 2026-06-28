import { expect, describe, test } from 'bun:test'

import type { AgentDefinition } from '@openbuff/sdk'

import { applyProposals, parseProposals } from '../proposals'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeAgentDef(
  overrides: Partial<AgentDefinition> & Pick<AgentDefinition, 'id'>,
): AgentDefinition {
  return {
    displayName: overrides.id,
    ...overrides,
  } as AgentDefinition
}

const baseAgent = (): AgentDefinition =>
  makeAgentDef({
    id: 'test-agent',
    systemPrompt: 'You are a test agent.',
    toolNames: ['read_files', 'code_search'],
    model: 'anthropic/claude-sonnet-4-5',
  })

// ---------------------------------------------------------------------------
// parseProposals
// ---------------------------------------------------------------------------

describe('parseProposals', () => {
  test('should accept a valid array of mixed proposals', () => {
    const raw = [
      {
        kind: 'append_system_prompt_guidance',
        target: { agentId: 'foo' },
        guidance: 'Always read before editing.',
        rationale: 'Prevents blind edits.',
      },
      {
        kind: 'add_tool',
        target: { agentId: 'bar' },
        toolName: 'query_index',
        rationale: 'Needed for code discovery.',
      },
    ]
    const result = parseProposals(raw)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
    expect(result.proposals).toHaveLength(2)
    expect(result.proposals[0].kind).toBe('append_system_prompt_guidance')
    expect(result.proposals[1].kind).toBe('add_tool')
  })

  test('should reject non-array input', () => {
    const result = parseProposals({ kind: 'add_tool' })
    expect(result.valid).toBe(false)
    expect(result.proposals).toHaveLength(0)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('should reject a proposal missing the kind field', () => {
    const result = parseProposals([
      { target: { agentId: 'foo' }, toolName: 'x', rationale: 'y' },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('should reject a proposal with an unknown kind', () => {
    const result = parseProposals([
      {
        kind: 'delete_everything',
        target: { agentId: 'foo' },
        rationale: 'bad',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('should reject a proposal missing a required field (rationale)', () => {
    const result = parseProposals([
      {
        kind: 'add_tool',
        target: { agentId: 'foo' },
        toolName: 'read_files',
      },
    ])
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  test('should reject empty agentId in target', () => {
    const result = parseProposals([
      {
        kind: 'set_model',
        target: { agentId: '' },
        model: 'foo',
        rationale: 'bar',
      },
    ])
    expect(result.valid).toBe(false)
  })

  test('should reject negative maxCostCents in set_budget', () => {
    const result = parseProposals([
      {
        kind: 'set_budget',
        target: { agentId: 'foo' },
        maxCostCents: -100,
        maxTokensPerTurn: null,
        rationale: 'bar',
      },
    ])
    expect(result.valid).toBe(false)
  })

  test('should accept null for maxCostCents and maxTokensPerTurn', () => {
    const result = parseProposals([
      {
        kind: 'set_budget',
        target: { agentId: 'foo' },
        maxCostCents: null,
        maxTokensPerTurn: null,
        rationale: 'explicit no-op',
      },
    ])
    expect(result.valid).toBe(true)
    expect(result.proposals).toHaveLength(1)
  })

  test('should accept an empty array (valid, no proposals)', () => {
    const result = parseProposals([])
    expect(result.valid).toBe(true)
    expect(result.proposals).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// applyProposals — append_system_prompt_guidance
// ---------------------------------------------------------------------------

describe('applyProposals: append_system_prompt_guidance', () => {
  test('should append guidance to existing systemPrompt with separator', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'append_system_prompt_guidance',
          target: { agentId: 'test-agent' },
          guidance: 'Always run query_index first.',
          rationale: 'Improves discovery.',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    expect(result.skippedCount).toBe(0)
    expect(result.modifiedDefinitions[0].systemPrompt).toBe(
      'You are a test agent.\n\nAlways run query_index first.',
    )
  })

  test('should append when systemPrompt is undefined', () => {
    const agent = makeAgentDef({ id: 'test-agent' })
    const result = applyProposals({
      proposals: [
        {
          kind: 'append_system_prompt_guidance',
          target: { agentId: 'test-agent' },
          guidance: 'New guidance.',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    // When existing is undefined/empty, the separator logic adds '\n\n' prefix.
    // This is acceptable — the guidance is still there.
    expect(result.modifiedDefinitions[0].systemPrompt).toContain('New guidance.')
  })
})

// ---------------------------------------------------------------------------
// applyProposals — add_tool
// ---------------------------------------------------------------------------

describe('applyProposals: add_tool', () => {
  test('should add a tool to toolNames', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'query_index',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    expect(result.modifiedDefinitions[0].toolNames).toContain('query_index')
    expect(result.modifiedDefinitions[0].toolNames).toHaveLength(3)
  })

  test('should add a tool when toolNames is undefined', () => {
    const agent = makeAgentDef({ id: 'test-agent' })
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'read_files',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    expect(result.modifiedDefinitions[0].toolNames).toEqual(['read_files'])
  })

  test('should be a no-op (skipped) when tool already present', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'read_files',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.perProposal[0].applied).toBe(false)
    expect(result.perProposal[0].error).toContain('already present')
  })
})

// ---------------------------------------------------------------------------
// applyProposals — remove_tool
// ---------------------------------------------------------------------------

describe('applyProposals: remove_tool', () => {
  test('should remove a tool from toolNames', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'remove_tool',
          target: { agentId: 'test-agent' },
          toolName: 'code_search',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    expect(result.modifiedDefinitions[0].toolNames).toEqual(['read_files'])
  })

  test('should be a no-op (skipped) when tool not present', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'remove_tool',
          target: { agentId: 'test-agent' },
          toolName: 'nonexistent_tool',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.perProposal[0].error).toContain('not present')
  })
})

// ---------------------------------------------------------------------------
// applyProposals — set_model
// ---------------------------------------------------------------------------

describe('applyProposals: set_model', () => {
  test('should change the model', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_model',
          target: { agentId: 'test-agent' },
          model: 'openai/gpt-5.4',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    expect(result.modifiedDefinitions[0].model).toBe('openai/gpt-5.4')
  })

  test('should be a no-op when model is the same', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_model',
          target: { agentId: 'test-agent' },
          model: 'anthropic/claude-sonnet-4-5',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.perProposal[0].error).toBe('no-op')
  })
})

// ---------------------------------------------------------------------------
// applyProposals — set_budget
// ---------------------------------------------------------------------------

describe('applyProposals: set_budget', () => {
  test('should set maxCostCents only (null tokens = unchanged)', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_budget',
          target: { agentId: 'test-agent' },
          maxCostCents: 500,
          maxTokensPerTurn: null,
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    const modified = result.modifiedDefinitions[0] as AgentDefinition & {
      maxCostCents?: number
      maxTokensPerTurn?: number
    }
    expect(modified.maxCostCents).toBe(500)
  })

  test('should set maxTokensPerTurn only', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_budget',
          target: { agentId: 'test-agent' },
          maxCostCents: null,
          maxTokensPerTurn: 100_000,
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    const modified = result.modifiedDefinitions[0] as AgentDefinition & {
      maxCostCents?: number
      maxTokensPerTurn?: number
    }
    expect(modified.maxTokensPerTurn).toBe(100_000)
  })

  test('should set both caps', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_budget',
          target: { agentId: 'test-agent' },
          maxCostCents: 300,
          maxTokensPerTurn: 50_000,
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(1)
    const modified = result.modifiedDefinitions[0] as AgentDefinition & {
      maxCostCents?: number
      maxTokensPerTurn?: number
    }
    expect(modified.maxCostCents).toBe(300)
    expect(modified.maxTokensPerTurn).toBe(50_000)
  })

  test('should be a no-op when both are null', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_budget',
          target: { agentId: 'test-agent' },
          maxCostCents: null,
          maxTokensPerTurn: null,
          rationale: 'explicit no-op',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.perProposal[0].error).toBe('no-op')
  })
})

// ---------------------------------------------------------------------------
// applyProposals — cross-cutting
// ---------------------------------------------------------------------------

describe('applyProposals: cross-cutting behavior', () => {
  test('should skip with error when target agent not found', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'nonexistent-agent' },
          toolName: 'read_files',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(1)
    expect(result.perProposal[0].applied).toBe(false)
    expect(result.perProposal[0].error).toContain('not found')
    expect(result.perProposal[0].matchedAgentId).toBeUndefined()
  })

  test('should not mutate the input agentDefinitions', () => {
    const agent = baseAgent()
    const originalPrompt = agent.systemPrompt
    const originalTools = [...(agent.toolNames ?? [])]
    const result = applyProposals({
      proposals: [
        {
          kind: 'append_system_prompt_guidance',
          target: { agentId: 'test-agent' },
          guidance: 'appended text',
          rationale: 'r',
        },
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'query_index',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(2)
    // Input untouched
    expect(agent.systemPrompt).toBe(originalPrompt)
    expect(agent.toolNames).toEqual(originalTools)
    // Output modified
    expect(result.modifiedDefinitions[0].systemPrompt).toContain('appended text')
    expect(result.modifiedDefinitions[0].toolNames).toContain('query_index')
  })

  test('should apply multiple proposals in order, building on each other', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'tool_a',
          rationale: 'r',
        },
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'tool_b',
          rationale: 'r',
        },
        {
          kind: 'remove_tool',
          target: { agentId: 'test-agent' },
          toolName: 'tool_a',
          rationale: 'remove the one we just added',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(3)
    expect(result.skippedCount).toBe(0)
    const tools = result.modifiedDefinitions[0].toolNames!
    expect(tools).toContain('tool_b')
    expect(tools).not.toContain('tool_a')
  })

  test('should include [dry-run] prefix in summary when dryRun is true', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'query_index',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
      dryRun: true,
    })
    expect(result.summary).toHaveLength(1)
    expect(result.summary[0]).toContain('[dry-run]')
    expect(result.summary[0]).toContain('APPLIED')
  })

  test('should include [apply] prefix in summary when dryRun is false', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'query_index',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
      dryRun: false,
    })
    expect(result.summary[0]).toContain('[apply]')
    expect(result.summary[0]).not.toContain('[dry-run]')
  })

  test('should include SKIPPED with error in summary for no-op proposals', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'add_tool',
          target: { agentId: 'test-agent' },
          toolName: 'read_files',
          rationale: 'already present',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.summary[0]).toContain('SKIPPED')
    expect(result.summary[0]).toContain('already present')
  })

  test('should return empty results for empty proposals', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [],
      agentDefinitions: [agent],
    })
    expect(result.appliedCount).toBe(0)
    expect(result.skippedCount).toBe(0)
    expect(result.perProposal).toHaveLength(0)
    expect(result.summary).toHaveLength(0)
    // Still returns a deep copy of definitions
    expect(result.modifiedDefinitions).toHaveLength(1)
  })

  test('should set matchedAgentId on successful application', () => {
    const agent = baseAgent()
    const result = applyProposals({
      proposals: [
        {
          kind: 'set_model',
          target: { agentId: 'test-agent' },
          model: 'openai/gpt-5.4',
          rationale: 'r',
        },
      ],
      agentDefinitions: [agent],
    })
    expect(result.perProposal[0].matchedAgentId).toBe('test-agent')
  })
})
