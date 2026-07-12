import { beforeEach, describe, expect, test } from 'bun:test'

import { getContentHash } from '@codebuff/common/util/content-hash'

import { handleApplyProposal } from '../proposal-actions'
import {
  appendProposalArtifact,
  clearAllProposalLedgers,
  getProposalRecord,
  transitionStoredProposal,
} from '../proposal-ledger-store'

function jsonValue(output: unknown): any {
  return (output as any).output[0].value
}

describe('proposal lifecycle', () => {
  beforeEach(() => clearAllProposalLedgers())

  test('[ABI-H02] applies an accepted proposal once through a canonical transaction', async () => {
    const runId = 'proposal-run'
    const base = 'before\n'
    const finalContent = 'after\n'
    const proposal = appendProposalArtifact(runId, {
      toolName: 'propose_write_file',
      input: { path: 'file.txt', content: finalContent },
      result: {
        file: 'file.txt',
        ok: true,
        finalContent,
        baseContent: base,
        baseContentHash: getContentHash(base),
      },
    })!
    const accepted = transitionStoredProposal({
      runId,
      proposalId: proposal.proposalId,
      expectedRevision: proposal.revision,
      expectedBaseHash: proposal.baseHash,
      state: 'accepted',
      updatedAt: 'accepted-at',
    })
    expect(accepted).toMatchObject({ state: 'accepted', revision: 2 })

    let disk = base
    let transactionCalls = 0
    const params = {
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'apply_proposal',
        toolCallId: 'apply-call',
        input: {
          proposalId: proposal.proposalId,
          expectedRevision: 2,
          expectedBaseHash: proposal.baseHash,
        },
      },
      runId,
      userInputId: 'input',
      signal: new AbortController().signal,
      requestOptionalFile: async () => disk,
      requestToolCall: async ({ input }: any) => {
        transactionCalls++
        disk = input[0].content
        return {
          output: [
            {
              type: 'json',
              value: {
                kind: 'file_mutation_result',
                version: 1,
                operationId: 'operation',
                outcome: 'applied',
                actions: [
                  {
                    actionId: 'operation:0',
                    index: 0,
                    action: 'update',
                    path: 'file.txt',
                    outcome: 'applied',
                    beforeHash: getContentHash(base),
                    afterHash: getContentHash(finalContent),
                  },
                ],
                authorityTier: 'conditional_commit',
                receiptId: 'receipt',
                authorityReceipt: {
                  kind: 'commit_receipt',
                  version: 1,
                  receiptId: 'receipt',
                  operationId: 'operation',
                  callId: 'apply-call',
                  authorityTier: 'conditional_commit',
                  status: 'committed',
                  actions: [
                    {
                      actionId: 'operation:0',
                      index: 0,
                      action: 'update',
                      path: 'file.txt',
                      status: 'committed',
                      beforeHash: getContentHash(base),
                      afterHash: getContentHash(finalContent),
                    },
                  ],
                  finalHashes: {
                    'file.txt': getContentHash(finalContent),
                  },
                },
                errors: [],
                freshCapabilities: [],
              },
            },
          ],
        }
      },
    }
    const first = await handleApplyProposal(params as any)
    expect(jsonValue(first)).toMatchObject({
      kind: 'proposal_result',
      state: 'applied',
      revision: 3,
      commitReceipt: { status: 'committed', receiptId: 'receipt' },
    })
    expect(transactionCalls).toBe(1)

    const repeated = await handleApplyProposal(params as any)
    expect(jsonValue(repeated)).toMatchObject({ state: 'applied', revision: 3 })
    expect(transactionCalls).toBe(1)
  })

  test('[ABI-H02] enforces CAS and marks accepted proposals stale before apply', async () => {
    const runId = 'stale-run'
    const base = 'base'
    const proposal = appendProposalArtifact(runId, {
      toolName: 'propose_write_file',
      input: { path: 'file.txt', content: 'next' },
      result: {
        file: 'file.txt',
        ok: true,
        finalContent: 'next',
        baseContent: base,
        baseContentHash: getContentHash(base),
      },
    })!
    expect(
      transitionStoredProposal({
        runId,
        proposalId: proposal.proposalId,
        expectedRevision: 99,
        expectedBaseHash: proposal.baseHash,
        state: 'accepted',
        updatedAt: 'bad-cas',
      }),
    ).toMatchObject({
      kind: 'proposal_action_error',
      error: { code: 'stale_state' },
    })
    transitionStoredProposal({
      runId,
      proposalId: proposal.proposalId,
      expectedRevision: 1,
      expectedBaseHash: proposal.baseHash,
      state: 'accepted',
      updatedAt: 'accepted',
    })

    let transactionCalls = 0
    const result = await handleApplyProposal({
      previousToolCallFinished: Promise.resolve(),
      toolCall: {
        toolName: 'apply_proposal',
        toolCallId: 'apply-stale',
        input: {
          proposalId: proposal.proposalId,
          expectedRevision: 2,
          expectedBaseHash: proposal.baseHash,
        },
      },
      runId,
      userInputId: 'input',
      signal: new AbortController().signal,
      requestOptionalFile: async () => 'externally changed',
      requestToolCall: async () => {
        transactionCalls++
        return { output: [] }
      },
    } as any)
    expect(jsonValue(result)).toMatchObject({ state: 'stale', revision: 3 })
    expect(getProposalRecord(runId, proposal.proposalId)?.state).toBe('stale')
    expect(transactionCalls).toBe(0)
  })

  test('[MUT-H04] rejection is terminal and never applies', () => {
    const proposal = appendProposalArtifact('reject-run', {
      toolName: 'propose_write_file',
      input: { path: 'file.txt', content: 'next' },
      result: {
        file: 'file.txt',
        ok: true,
        finalContent: 'next',
        baseContent: null,
        baseContentHash: null,
      },
    })!
    const rejected = transitionStoredProposal({
      runId: 'reject-run',
      proposalId: proposal.proposalId,
      expectedRevision: 1,
      expectedBaseHash: proposal.baseHash,
      state: 'rejected',
      updatedAt: 'rejected',
    })
    expect(rejected).toMatchObject({ state: 'rejected', revision: 2 })
    expect(
      transitionStoredProposal({
        runId: 'reject-run',
        proposalId: proposal.proposalId,
        expectedRevision: 2,
        expectedBaseHash: proposal.baseHash,
        state: 'accepted',
        updatedAt: 'illegal',
      }),
    ).toMatchObject({
      kind: 'proposal_action_error',
      error: { code: 'illegal_transition' },
    })
  })
})
