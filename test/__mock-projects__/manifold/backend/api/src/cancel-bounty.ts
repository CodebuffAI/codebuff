import { createBountyCanceledNotification } from 'shared/create-notification'
import { runCancelBountyTxn } from 'shared/txn/run-bounty-txn'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from './helpers/endpoint'
import { getContractSupabase } from 'shared/utils'
import { isAdminId } from 'common/envs/constants'

const bodySchema = z
  .object({
    contractId: z.string(),
  })
  .strict()

export const cancelbounty = authEndpoint(async (req, auth) => {
  const { contractId } = validate(bodySchema, req.body)

  const contract = await getContractSupabase(contractId)

  if (!contract) throw new APIError(404, 'Contract not found')

  if (
    contract.mechanism !== 'none' ||
    contract.outcomeType != 'BOUNTIED_QUESTION'
  )
    throw new APIError(403, 'This is contract not a bounty')

  if (
    !contract.creatorId ||
    (contract.creatorId !== auth.uid && !isAdminId(auth.uid))
  )
    throw new APIError(403, 'You are not allowed to cancel this bounty')

  if (contract.bountyLeft <= 0)
    throw new APIError(403, 'Bounty already fully dispersed')

  const txn = await runCancelBountyTxn(
    {
      category: 'BOUNTY_CANCELED',
      fromId: contractId,
      fromType: 'CONTRACT',
      toId: contract.creatorId,
      toType: 'USER',
      token: 'M$',
      amount: contract.bountyLeft,
    },
    contract.closeTime
  )

  await createBountyCanceledNotification(contract, contract.bountyLeft)

  return { status: 'success', txn }
})
