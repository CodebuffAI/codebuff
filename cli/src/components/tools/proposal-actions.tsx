import { TextAttributes } from '@opentui/core'

import { useTheme } from '../../hooks/use-theme'
import { useMessageBlockStore } from '../../state/message-block-store'
import { getToolOutputValues } from '../../utils/tool-result-normalizer'
import { Button } from '../button'
import { defineToolComponent } from './types'

import type { ToolName } from '@openbuff/sdk'

const PROPOSAL_ACTION_TOOLS = [
  'read_proposals',
  'accept_proposal',
  'reject_proposal',
  'apply_proposal',
] as const satisfies readonly ToolName[]

function proposalActionComponent(
  toolName: (typeof PROPOSAL_ACTION_TOOLS)[number],
) {
  return defineToolComponent({
    toolName,
    render(toolBlock) {
      const theme = useTheme()
      const onInsertCommand = useMessageBlockStore(
        (store) => store.callbacks.onInsertCommand,
      )
      const input = toolBlock.input as Record<string, unknown>
      const values = getToolOutputValues(toolBlock.outputRaw).flatMap(
        (value) => (Array.isArray(value) ? value : [value]),
      )
      const proposal = values.find(
        (value) =>
          value &&
          typeof value === 'object' &&
          (value as Record<string, unknown>).kind === 'proposal_result',
      ) as Record<string, unknown> | undefined
      const actionError = values.find(
        (value) =>
          value &&
          typeof value === 'object' &&
          (value as Record<string, unknown>).kind === 'proposal_action_error',
      ) as Record<string, unknown> | undefined
      const error =
        actionError?.error && typeof actionError.error === 'object'
          ? (actionError.error as Record<string, unknown>)
          : null
      const proposalId = String(
        proposal?.proposalId ??
          actionError?.proposalId ??
          input.proposalId ??
          '',
      )
      const state = proposal?.state ? String(proposal.state) : null
      const revision = proposal?.revision ?? input.expectedRevision
      const operations = Array.isArray(proposal?.operations)
        ? (proposal.operations as Array<Record<string, unknown>>)
        : []
      const title =
        toolName === 'read_proposals'
          ? 'Proposals'
          : toolName === 'accept_proposal'
            ? 'Accept proposal'
            : toolName === 'reject_proposal'
              ? 'Reject proposal'
              : 'Apply proposal'

      return {
        collapsedPreview: `${title}${state ? ` · ${state}` : ''}`,
        content: (
          <box style={{ flexDirection: 'column', width: '100%' }}>
            <text>
              <span fg={theme.foreground} attributes={TextAttributes.BOLD}>
                {title}
              </span>
              {state ? <span fg={theme.muted}>{` · ${state}`}</span> : null}
            </text>
            {proposalId ? (
              <text
                fg={theme.muted}
              >{`${proposalId}${revision ? ` · revision ${String(revision)}` : ''}`}</text>
            ) : null}
            {operations.map((operation, index) => (
              <text
                key={`${String(operation.operationId ?? index)}`}
                fg={theme.muted}
              >
                {`${String(operation.action ?? 'edit')} ${String(operation.path ?? '')}${operation.destinationPath ? ` → ${String(operation.destinationPath)}` : ''}`}
              </text>
            ))}
            {error ? (
              <text fg={theme.error}>
                {String(
                  error.message ?? error.code ?? 'Proposal action failed',
                )}
              </text>
            ) : null}
            {state === 'stale' ? (
              <text fg={theme.error}>
                Rebuild from a fresh read before applying.
              </text>
            ) : null}
            {state === 'accepted' ? (
              <text fg={theme.muted}>
                Accepted; application is still pending.
              </text>
            ) : null}
            {proposalId &&
            (state === 'proposed' ||
              state === 'accepted' ||
              state === 'stale') ? (
              <box style={{ flexDirection: 'row', gap: 1 }}>
                {state === 'proposed' ? (
                  <Button
                    onClick={() =>
                      onInsertCommand(
                        `Accept proposal ${proposalId} revision ${String(revision)} using its current base hash.`,
                      )
                    }
                  >
                    <text fg={theme.foreground}>Accept</text>
                  </Button>
                ) : null}
                {state === 'accepted' ? (
                  <Button
                    onClick={() =>
                      onInsertCommand(
                        `Apply accepted proposal ${proposalId} revision ${String(revision)} after revalidating its base hash.`,
                      )
                    }
                  >
                    <text fg={theme.foreground}>Apply</text>
                  </Button>
                ) : null}
                {state === 'proposed' || state === 'accepted' ? (
                  <Button
                    onClick={() =>
                      onInsertCommand(
                        `Reject proposal ${proposalId} revision ${String(revision)} using its current base hash.`,
                      )
                    }
                  >
                    <text fg={theme.muted}>Reject</text>
                  </Button>
                ) : null}
                {state === 'stale' ? (
                  <Button
                    onClick={() =>
                      onInsertCommand(
                        `Re-read the affected files and rebuild stale proposal ${proposalId}.`,
                      )
                    }
                  >
                    <text fg={theme.foreground}>Rebuild</text>
                  </Button>
                ) : null}
              </box>
            ) : null}
          </box>
        ),
      }
    },
  })
}

export const ProposalActionComponents = PROPOSAL_ACTION_TOOLS.map(
  proposalActionComponent,
)
