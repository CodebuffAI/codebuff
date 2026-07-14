import { jsonToolResult } from '@codebuff/common/util/messages'
import { getContentHash } from '@codebuff/common/util/content-hash'
import {
  fileMutationResultV1Schema,
  type FilesystemError,
  type ProposalActionErrorV1,
} from '@codebuff/common/tools/results/filesystem'

import {
  abortProposalApplication,
  beginProposalApplication,
  completeProposalApplication,
  getProposalRecords,
  markProposalApplicationStale,
  transitionStoredProposal,
} from './proposal-ledger-store'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

function actionError(
  error: FilesystemError,
  proposalId?: string,
): ProposalActionErrorV1 {
  return {
    kind: 'proposal_action_error',
    version: 1,
    ...(proposalId ? { proposalId } : {}),
    error,
  }
}

export const handleReadProposals = (async ({
  previousToolCallFinished,
  toolCall,
  runId,
}) => {
  await previousToolCallFinished
  return {
    output: jsonToolResult(
      getProposalRecords(runId, toolCall.input.proposalIds),
    ),
  }
}) satisfies CodebuffToolHandlerFunction<'read_proposals'>

export const handleAcceptProposal = (async ({
  previousToolCallFinished,
  toolCall,
  runId,
}) => {
  await previousToolCallFinished
  return {
    output: jsonToolResult(
      transitionStoredProposal({
        runId,
        ...toolCall.input,
        state: 'accepted',
        updatedAt: new Date().toISOString(),
      }),
    ),
  }
}) satisfies CodebuffToolHandlerFunction<'accept_proposal'>

export const handleRejectProposal = (async ({
  previousToolCallFinished,
  toolCall,
  runId,
}) => {
  await previousToolCallFinished
  return {
    output: jsonToolResult(
      transitionStoredProposal({
        runId,
        ...toolCall.input,
        state: 'rejected',
        updatedAt: new Date().toISOString(),
      }),
    ),
  }
}) satisfies CodebuffToolHandlerFunction<'reject_proposal'>

export const handleApplyProposal = (async (
  params: {
    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'> &
    Parameters<CodebuffToolHandlerFunction<'apply_proposal'>>[0],
) => {
  const {
    previousToolCallFinished,
    toolCall,
    runId,
    requestOptionalFile,
    requestToolCall,
    userInputId,
    signal,
  } = params
  await previousToolCallFinished

  const begun = beginProposalApplication({ runId, ...toolCall.input })
  if (!begun.ok) return { output: jsonToolResult(begun.error) }
  if (begun.idempotent) return { output: jsonToolResult(begun.proposal) }
  const token = begun.token!

  try {
    for (const operation of begun.proposal.operations) {
      const current = await requestOptionalFile({
        ...params,
        filePath: operation.path,
      })
      const currentHash = current === null ? null : getContentHash(current)
      if (currentHash !== operation.baseHash) {
        const stale = markProposalApplicationStale({
          runId,
          proposalId: begun.proposal.proposalId,
          token,
          updatedAt: new Date().toISOString(),
        })
        return { output: jsonToolResult(stale) }
      }
      if (operation.action === 'move') {
        const destination = await requestOptionalFile({
          ...params,
          filePath: operation.destinationPath!,
        })
        if (destination !== null) {
          const stale = markProposalApplicationStale({
            runId,
            proposalId: begun.proposal.proposalId,
            token,
            updatedAt: new Date().toISOString(),
          })
          return { output: jsonToolResult(stale) }
        }
      }
    }

    const response = await requestToolCall({
      userInputId,
      callId: toolCall.toolCallId,
      toolName: 'edit_transaction',
      input: begun.proposal.operations.map((operation) =>
        operation.action === 'delete'
          ? {
              type: 'delete' as const,
              path: operation.path,
              expectedHash: operation.baseHash!,
            }
          : operation.action === 'move'
            ? {
                type: 'move' as const,
                path: operation.path,
                destinationPath: operation.destinationPath!,
                expectedHash: operation.baseHash!,
                destinationExpectedHash: null,
              }
            : {
                type: 'file' as const,
                path: operation.path,
                content: operation.finalContent!,
                expectedHash: operation.baseHash,
              },
      ),
      signal,
    })
    const mutation = response.output
      .filter((part) => part.type === 'json')
      .map((part) => fileMutationResultV1Schema.safeParse(part.value))
      .find((parsed) => parsed.success)?.data
    if (
      !mutation ||
      mutation.outcome !== 'applied' ||
      mutation.authorityTier === null ||
      !mutation.authorityReceipt ||
      mutation.authorityReceipt.status !== 'committed' ||
      mutation.authorityReceipt.callId !== toolCall.toolCallId ||
      mutation.actions.length !== begun.proposal.operations.length ||
      mutation.actions.some((action, index) => {
        const operation = begun.proposal.operations[index]
        return (
          action.outcome !== 'applied' ||
          action.action !== operation?.action ||
          action.path !== operation.path ||
          action.destinationPath !== operation.destinationPath
        )
      })
    ) {
      abortProposalApplication(runId, begun.proposal.proposalId, token)
      return {
        output: jsonToolResult(
          actionError(
            {
              code: 'malformed_result',
              message:
                'Proposal application was not confirmed by a canonical authority-backed mutation result. Re-read every affected path before retrying.',
              retryable: false,
              requiresFreshRead: true,
              recovery: 'read_again',
            },
            begun.proposal.proposalId,
          ),
        ),
      }
    }

    for (const operation of begun.proposal.operations) {
      const current = await requestOptionalFile({
        ...params,
        filePath: operation.path,
      })
      const postCommitMatches =
        operation.action === 'delete' || operation.action === 'move'
          ? current === null
          : current !== null &&
            operation.finalContent !== undefined &&
            getContentHash(current) === getContentHash(operation.finalContent)
      let destinationMatches = true
      if (postCommitMatches && operation.action === 'move') {
        const destination = await requestOptionalFile({
          ...params,
          filePath: operation.destinationPath!,
        })
        destinationMatches =
          destination !== null &&
          operation.finalContent !== undefined &&
          getContentHash(destination) === getContentHash(operation.finalContent)
      }
      if (!postCommitMatches || !destinationMatches) {
        abortProposalApplication(runId, begun.proposal.proposalId, token)
        return {
          output: jsonToolResult(
            actionError(
              {
                code: 'application_rejected',
                message:
                  'Post-commit verification did not match the proposed content. Re-read every affected path before continuing.',
                retryable: false,
                requiresFreshRead: true,
                recovery: 'read_again',
              },
              begun.proposal.proposalId,
            ),
          ),
        }
      }
    }

    const receipt = mutation.authorityReceipt
    const completed = completeProposalApplication({
      runId,
      proposalId: begun.proposal.proposalId,
      token,
      updatedAt: new Date().toISOString(),
      commitReceipt: receipt,
    })
    if (completed.kind !== 'proposal_result') {
      return { output: jsonToolResult(completed) }
    }
    return {
      output: [
        { type: 'json', value: completed },
        { type: 'json', value: mutation },
      ],
    }
  } catch (error) {
    abortProposalApplication(runId, begun.proposal.proposalId, token)
    return {
      output: jsonToolResult(
        actionError(
          {
            code: signal.aborted ? 'cancelled' : 'io_error',
            message:
              error instanceof Error
                ? error.message
                : 'Proposal application failed unexpectedly.',
            retryable: !signal.aborted,
            recovery: signal.aborted ? undefined : 'retry',
          },
          begun.proposal.proposalId,
        ),
      ),
    }
  }
}) satisfies CodebuffToolHandlerFunction<'apply_proposal'>
