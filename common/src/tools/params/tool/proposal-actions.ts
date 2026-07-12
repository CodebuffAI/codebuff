import z from 'zod/v4'

import {
  fileMutationResultV1Schema,
  proposalActionErrorV1Schema,
  proposalResultV1Schema,
} from '../../results/filesystem'
import { jsonToolResultSchema } from '../utils'

import type { $ToolParams } from '../../constants'

const proposalCasInputSchema = z.object({
  proposalId: z.string().min(1, 'proposalId cannot be empty'),
  expectedRevision: z.number().int().positive(),
  expectedBaseHash: z.string().min(1, 'expectedBaseHash cannot be empty'),
})

const proposalActionOutputSchema = jsonToolResultSchema(
  z.union([proposalResultV1Schema, proposalActionErrorV1Schema]),
)

export const readProposalsParams = {
  toolName: 'read_proposals',
  endsAgentStep: false,
  description:
    'Read typed proposal records for this run. Omit proposalIds to list every current-attempt proposal.',
  inputSchema: z.object({
    proposalIds: z.array(z.string().min(1)).min(1).optional(),
  }),
  outputSchema: jsonToolResultSchema(
    z.array(z.union([proposalResultV1Schema, proposalActionErrorV1Schema])),
  ),
} satisfies $ToolParams

export const acceptProposalParams = {
  toolName: 'accept_proposal',
  endsAgentStep: false,
  description:
    'Accept a proposed revision for later application. Acceptance does not write files.',
  inputSchema: proposalCasInputSchema,
  outputSchema: proposalActionOutputSchema,
} satisfies $ToolParams

export const rejectProposalParams = {
  toolName: 'reject_proposal',
  endsAgentStep: false,
  description:
    'Reject a proposed revision. Rejected proposals are immutable and cannot be applied.',
  inputSchema: proposalCasInputSchema,
  outputSchema: proposalActionOutputSchema,
} satisfies $ToolParams

export const applyProposalParams = {
  toolName: 'apply_proposal',
  endsAgentStep: false,
  description:
    'Revalidate and apply an accepted proposal through one coordinated client transaction.',
  inputSchema: proposalCasInputSchema,
  outputSchema: z.union([
    proposalActionOutputSchema,
    z.tuple([
      z.object({ type: z.literal('json'), value: proposalResultV1Schema }),
      z.object({ type: z.literal('json'), value: fileMutationResultV1Schema }),
    ]),
  ]),
} satisfies $ToolParams
