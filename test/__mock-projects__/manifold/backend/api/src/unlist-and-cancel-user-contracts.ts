import { APIError, type APIHandler } from './helpers/endpoint'
import { isAdminId, isModId } from 'common/envs/constants'
import { throwErrorIfNotMod } from 'shared/helpers/auth'
import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { resolveMarketHelper } from 'shared/resolve-market-helpers'
import { getUser } from 'shared/utils'
import { Contract } from 'common/contract'
import { betsQueue } from 'shared/helpers/fn-queue'
import { updateContract } from 'shared/supabase/contracts'

export const unlistAndCancelUserContracts: APIHandler<
  'unlist-and-cancel-user-contracts'
> = async ({ userId }, auth) => {
  if (!isAdminId(auth.uid) && !isModId(auth.uid)) {
    throw new APIError(403, 'Only admins and mods can perform this action.')
  }

  await throwErrorIfNotMod(auth.uid)

  const resolver = await getUser(auth.uid)
  if (!resolver) {
    throw new APIError(500, 'Resolver not found')
  }
  const creator = await getUser(userId)
  if (!creator) {
    throw new APIError(500, 'Creator not found')
  }

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  const { data, error } = await db
    .from('contracts')
    .select('data')
    .eq('creatorId', userId)
  if (error) {
    throw new APIError(500, 'Failed to fetch contracts: ' + error.message)
  }

  const contracts = data.map((contract) => contract.data as Contract)

  if (contracts.length === 0) {
    console.log('No contracts found for this user.')
    return
  }

  if (contracts.length > 5) {
    throw new APIError(
      400,
      `This user has ${contracts.length} markets. You can only super ban users with 5 or less.`
    )
  }

  for (const contract of contracts) {
    await updateContract(pg, contract.id, {
      visibility: 'unlisted',
    })
  }

  try {
    await Promise.all(
      contracts.map((contract) =>
        betsQueue.enqueueFnFirst(
          () =>
            resolveMarketHelper(contract, resolver, creator, {
              outcome: 'CANCEL',
            }),
          [contract.id, creator.id]
        )
      )
    )
  } catch (error) {
    console.error('Error resolving contracts:', error)
    throw new APIError(500, 'Failed to update one or more contracts.')
  }
}
