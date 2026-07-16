import { describe, expect, test } from 'bun:test'

import {
  commitTaskMemory,
  compileTaskMemoryContext,
  deriveTaskMemoryDraftFromMessages,
  mergeAgentReceiptIntoTaskMemory,
  mergeTaskMemoryDraft,
} from '../task-memory'

const draft = {
  schemaVersion: 1 as const,
  goal: 'Ship the context compiler',
  requirements: ['Preserve requirements'],
  decisions: ['Use typed memory'],
  filesInspected: ['src/a.ts'],
  editsMade: [],
  validationResults: [],
  reviewReceipts: [],
  blockers: ['Need tests'],
  nextActions: ['Run tests'],
  historicalSummary: 'Earlier work',
  evidence: [],
}

describe('task memory', () => {
  test('commits revisions transactionally and rejects stale writers', () => {
    const first = commitTaskMemory({
      draft,
      expectedRevision: -1,
      now: 10,
    })
    expect(first.revision).toBe(0)
    expect(first.checksum).toHaveLength(8)
    expect(() =>
      commitTaskMemory({
        current: first,
        draft,
        expectedRevision: -1,
      }),
    ).toThrow('revision conflict')
    const second = commitTaskMemory({
      current: first,
      draft: mergeTaskMemoryDraft(first, {
        ...draft,
        decisions: ['Compile per request'],
      }),
      expectedRevision: 0,
      now: 20,
    })
    expect(second.revision).toBe(1)
    expect(second.decisions).toEqual([
      'Use typed memory',
      'Compile per request',
    ])
  })

  test('compiles bounded role-specific request context', () => {
    const memory = commitTaskMemory({ draft, expectedRevision: -1 })
    const compiled = compileTaskMemoryContext({
      memory,
      agentType: 'editor',
      contextWindowTokens: 8_000,
      rootAgent: false,
    })
    expect(compiled).toContain('<task_memory>')
    expect(compiled).toContain('Ship the context compiler')
    expect(compiled).toContain('Need tests')
  })

  test('keeps critical recall fields valid and excludes revision-stale evidence for small models', () => {
    const memory = commitTaskMemory({
      draft: {
        ...draft,
        requirements: Array.from(
          { length: 40 },
          (_, index) => `Requirement ${index}: ${'detail '.repeat(80)}`,
        ),
        decisions: ['Use route-safe budgets'],
        blockers: ['Reviewer protocol must clear'],
        nextActions: ['Resume the exact pending validation action'],
        workspaceRevision: 9,
        workspaceSnapshotId: 'workspace-9',
        evidence: [
          {
            id: 'old-read',
            kind: 'read',
            summary: 'stale file contents',
            workspaceRevision: 8,
          },
          {
            id: 'live-read',
            kind: 'read',
            summary: 'fresh file contents',
            workspaceRevision: 9,
          },
        ],
      },
      expectedRevision: -1,
    })
    const compiled = compileTaskMemoryContext({
      memory,
      agentType: 'repair-editor',
      contextWindowTokens: 8_000,
      rootAgent: false,
    })
    const json = compiled.match(
      /<task_memory>[\s\S]*?\n(\{[\s\S]*\})\n<\/task_memory>/,
    )?.[1]
    expect(json).toBeDefined()
    const parsed = JSON.parse(json!)
    expect(compiled.length).toBeLessThan(4_000)
    expect(parsed.blockers).toContain('Reviewer protocol must clear')
    expect(parsed.nextActions).toContain(
      'Resume the exact pending validation action',
    )
    expect(parsed.workspaceRevision).toBe(9)
    expect(JSON.stringify(parsed.evidence)).toContain('fresh file contents')
    expect(JSON.stringify(parsed.evidence)).not.toContain('stale file contents')
  })

  test('imports legacy knowledge blocks without making them authoritative chat', () => {
    const derived = deriveTaskMemoryDraftFromMessages({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                '<knowledge_memory>',
                'Goal:',
                '  Keep state',
                'Decisions:',
                '  - Use revisions',
                'Blockers:',
                '  - None',
                'Next Action:',
                '  Validate',
                '</knowledge_memory>',
              ].join('\n'),
            },
          ],
        },
      ],
    })
    expect(derived.goal).toBe('Keep state')
    expect(derived.decisions).toEqual(['Use revisions'])
    expect(derived.nextActions).toEqual(['Validate'])
  })

  test('preserves requirements, decisions, blockers, revision, and resume action across repeated compactions', () => {
    let memory = commitTaskMemory({
      expectedRevision: -1,
      now: 1,
      draft: {
        ...draft,
        requirements: ['Never lose the user requirement'],
        decisions: ['Keep typed memory authoritative'],
        blockers: ['Fresh reviewer receipt still required'],
        nextActions: ['Run the matching reviewer gate'],
        workspaceRevision: 17,
        workspaceSnapshotId: 'workspace-17',
      },
    })

    for (let pass = 0; pass < 4; pass += 1) {
      memory = commitTaskMemory({
        current: memory,
        expectedRevision: memory.revision,
        now: pass + 2,
        draft: mergeTaskMemoryDraft(memory, {
          ...draft,
          goal: '',
          requirements: [],
          decisions: [],
          blockers: [],
          nextActions: [],
          historicalSummary: `compaction pass ${pass + 1}`,
          workspaceRevision: 17,
          workspaceSnapshotId: 'workspace-17',
        }),
      })
    }

    expect(memory.revision).toBe(4)
    for (const contextWindowTokens of [32_000, 1_000_000]) {
      const compiled = compileTaskMemoryContext({
        memory,
        agentType: 'base2',
        contextWindowTokens,
        rootAgent: true,
      })
      expect(compiled).toContain('Never lose the user requirement')
      expect(compiled).toContain('Keep typed memory authoritative')
      expect(compiled).toContain('Fresh reviewer receipt still required')
      expect(compiled).toContain('Run the matching reviewer gate')
      expect(compiled).toContain('workspace-17')
    }
  })

  test('stores oversized reviewer receipts as bounded valid JSON', () => {
    const longEvidence = 'evidence '.repeat(300)
    const snapshotFingerprint =
      '42e53a6db836535c0088089375e4601d23061e52d7b44f39fa85815fc225523a'
    const memory = mergeAgentReceiptIntoTaskMemory({
      objective: 'Review the routed change',
      receipt: {
        schemaVersion: 1,
        receiptId: 'review-receipt-1',
        taskId: 'review-task-1',
        role: 'reviewer',
        agentId: 'integration-reviewer-1',
        status: 'completed',
        changedFiles: [],
        requirementsAddressed: [],
        acceptanceCriteriaAddressed: [],
        findingsAddressed: [],
        evidence: [
          {
            id: 'review-evidence-1',
            kind: 'review',
            summary: longEvidence,
          },
        ],
        assumptions: [],
        unresolved: [],
        requestedValidation: [],
        artifacts: [],
        errors: [],
        output: {
          schemaVersion: 1,
          family: 'reviewer',
          verdict: 'LOOKS_GOOD',
          snapshotFingerprint,
          reviewedFiles: [
            'client/src/routes/_index/compare.lazy.tsx',
            'client/src/routes/_index/blog/index.lazy.tsx',
            'client/src/routes/_index/index.lazy.tsx',
          ],
          coverage: 'covered',
          dimensions: { integration: 'pass' },
          findings: [],
          requirementCoverage: [
            {
              requirement:
                'Continue after correcting the specialist protocol output',
              status: 'satisfied',
              evidence: [longEvidence],
            },
          ],
        },
      },
    })

    expect(memory.reviewReceipts).toHaveLength(1)
    expect(memory.reviewReceipts[0]!.length).toBeLessThanOrEqual(4_000)
    const stored = JSON.parse(memory.reviewReceipts[0]!)
    expect(stored.review).toMatchObject({
      verdict: 'LOOKS_GOOD',
      snapshotFingerprint,
      reviewedFileCount: 3,
      requirementCount: 1,
    })
  })
})
