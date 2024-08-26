import {
  createSupabaseClient,
  createSupabaseDirectClient,
} from 'shared/supabase/init'
import { APIError, type APIHandler } from './helpers/endpoint'
import { convertContract } from 'common/supabase/contracts'
import {
  addGroupToContract,
  removeGroupFromContract,
  canUserAddGroupToMarket,
} from 'shared/update-group-contracts-internal'
import { MAX_GROUPS_PER_MARKET } from 'common/group'
import { revalidateContractStaticProps } from 'shared/utils'
import { upsertGroupEmbedding } from 'shared/helpers/embeddings'
import { isAdminId, isModId } from 'common/envs/constants'
import {
  UNRANKED_GROUP_ID,
  UNSUBSIDIZED_GROUP_ID,
} from 'common/supabase/groups'
import { rerankContractMetricsManually } from 'shared/helpers/user-contract-metrics'

export const addOrRemoveTopicFromContract: APIHandler<
  'market/:contractId/group'
> = async (props, auth) => {
  const { contractId, groupId, remove } = props

  const db = createSupabaseClient()
  const pg = createSupabaseDirectClient()

  const { data: membership } = await db
    .from('group_members')
    .select()
    .eq('member_id', auth.uid)
    .eq('group_id', groupId)
    .single()

  const groupQuery = await db.from('groups').select().eq('id', groupId).single()

  const contractQuery = await db
    .from('contracts')
    .select('data, importance_score, view_count')
    .eq('id', contractId)
    .single()

  if (groupQuery.error) throw new APIError(404, 'Group cannot be found')
  if (contractQuery.error) throw new APIError(404, 'Contract cannot be found')
  const group = groupQuery.data
  const contract = convertContract(contractQuery.data)

  const { count: existingCount } = await db
    .from('group_contracts')
    .select('*', { count: 'exact', head: true })
    .eq('contract_id', contractId)

  if (
    !remove &&
    (existingCount ?? 0) > MAX_GROUPS_PER_MARKET &&
    !isModId(auth.uid) &&
    !isAdminId(auth.uid) &&
    ![UNSUBSIDIZED_GROUP_ID, UNRANKED_GROUP_ID].includes(groupId)
  ) {
    throw new APIError(
      403,
      `A question can only have up to ${MAX_GROUPS_PER_MARKET} topic tags.`
    )
  }

  const canUpdate = canUserAddGroupToMarket({
    userId: auth.uid,
    group,
    contract,
    membership: membership ?? undefined,
  })

  if (!canUpdate) {
    throw new APIError(403, 'Permission denied')
  }

  if (remove) {
    await removeGroupFromContract(pg, contract, group, auth.uid)
  } else {
    await addGroupToContract(pg, contract, group, auth.uid)
  }

  const continuation = async () => {
    await revalidateContractStaticProps(contract)
    if (group.id === UNRANKED_GROUP_ID) {
      await rerankContractMetricsManually(
        contract.id,
        remove && contract.visibility === 'public',
        contract.resolutionTime
      )
    }
    await upsertGroupEmbedding(createSupabaseDirectClient(), groupId)
  }

  return {
    result: { success: true },
    continue: continuation,
  }
}
