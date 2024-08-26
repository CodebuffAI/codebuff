import { isAdminId } from 'common/envs/constants'
import { APIError, type APIHandler } from './helpers/endpoint'
import { getContract, log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updateContract } from 'shared/supabase/contracts'

export const closeMarket: APIHandler<'market/:contractId/close'> = async (
  props,
  auth
) => {
  const { contractId, closeTime } = props
  const pg = createSupabaseDirectClient()
  const contract = await getContract(pg, contractId)
  if (!contract) throw new APIError(404, 'Contract not found')
  const { creatorId } = contract

  if (creatorId !== auth.uid && !isAdminId(auth.uid))
    throw new APIError(403, 'User is not creator of contract')

  const now = Date.now()
  if (!closeTime && contract.closeTime && contract.closeTime < now)
    throw new APIError(403, 'Contract already closed')

  if (closeTime && closeTime < now)
    throw new APIError(
      400,
      'Close time must be in the future. ' +
        'Alternatively, do not provide a close time to close immediately.'
    )

  await updateContract(pg, contractId, {
    closeTime: closeTime ? closeTime : now,
  })

  log('contract ' + contractId + ' closed')
}
