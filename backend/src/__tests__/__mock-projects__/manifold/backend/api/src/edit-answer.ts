import { z } from 'zod'
import { MAX_ANSWER_LENGTH } from 'common/answer'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { recordContractEdit } from 'shared/record-contract-edit'
import { HOUR_MS } from 'common/util/time'
import { removeUndefinedProps } from 'common/util/object'
import { getAnswer, updateAnswer } from 'shared/supabase/answers'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getContract } from 'shared/utils'

const bodySchema = z
  .object({
    contractId: z.string().max(MAX_ANSWER_LENGTH),
    answerId: z.string().max(MAX_ANSWER_LENGTH),
    text: z.string().min(1).max(MAX_ANSWER_LENGTH).optional(),
    color: z.string().length(7).startsWith('#').optional(),
  })
  .strict()

export const editanswercpmm = authEndpoint(async (req, auth) => {
  const { contractId, answerId, text, color } = validate(bodySchema, req.body)

  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found')

  if (contract.mechanism !== 'cpmm-multi-1')
    throw new APIError(403, 'Requires a cpmm multiple choice contract')

  const { closeTime } = contract
  if (closeTime && Date.now() > closeTime)
    throw new APIError(403, 'Cannot edit answer after market closes')

  const answer = await getAnswer(pg, answerId)
  if (!answer) throw new APIError(404, 'Answer not found')

  if (answer.resolution)
    throw new APIError(403, 'Cannot edit answer that is already resolved')

  if (
    answer.userId === auth.uid &&
    answer.userId !== contract.creatorId &&
    !isModId(auth.uid) &&
    !isAdminId(auth.uid) &&
    answer.createdTime < Date.now() - HOUR_MS
  )
    throw new APIError(
      403,
      'Answerer can only edit answer within 1 hour of creation'
    )

  if (
    answer.userId !== auth.uid &&
    contract.creatorId !== auth.uid &&
    !isAdminId(auth.uid) &&
    !isModId(auth.uid)
  )
    throw new APIError(403, 'Contract owner, mod, or answer owner required')

  const update = removeUndefinedProps({ text, color })
  await updateAnswer(pg, answerId, update)

  await recordContractEdit(contract, auth.uid, ['answers'])

  return { status: 'success' }
})
