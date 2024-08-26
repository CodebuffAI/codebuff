import { SupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { isAdminId } from 'common/envs/constants'
import { convertContract } from 'common/supabase/contracts'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { APIError } from 'common/api/utils'
import { broadcastUpdatedContract } from 'shared/websockets/helpers'
import { updateData, DataUpdate } from './utils'
import { mapValues } from 'lodash'
import { log } from 'shared/utils'

// used for API to allow slug as param
export const getContractIdFromSlug = async (
  pg: SupabaseDirectClient,
  slug?: string
) => {
  if (!slug) return undefined
  const id = await pg.oneOrNone(
    `select id from contracts where slug = $1`,
    [slug],
    (r) => r?.id as string
  )
  if (!id) throw new APIError(400, 'No contract found with that slug')
  return id
}

export const getUniqueBettorIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `
      select
          distinct user_id
      from contract_bets
        where contract_id = $1`,
    [contractId]
  )
  return res.map((r) => r.user_id as string)
}

export const getUniqueVoterIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  return await pg.map(
    `select distinct user_id
       from votes cb
        where contract_id = $1
       `,
    [contractId],
    (r) => r.user_id
  )
}

export const getContractsDirect = async (
  contractIds: string[],
  pg: SupabaseDirectClient
) => {
  if (contractIds.length === 0) return [] as Contract[]

  return await pg.map(
    `select data, importance_score, conversion_score, freshness_score, view_count, token from contracts where id in ($1:list)`,
    [contractIds],
    (r) => convertContract(r)
  )
}

export const getUniqueBettorIdsForAnswer = async (
  contractId: string,
  answerId: string,
  pg: SupabaseDirectClient
) => {
  const res = await pg.manyOrNone(
    `select distinct user_id
      from contract_bets
      where contract_id = $1
      and answer_id = $2
      and is_redemption = false`,
    [contractId, answerId]
  )
  return res.map((r) => r.user_id as string)
}

export const getContractFollowerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const followerIds = await pg.manyOrNone<{ follow_id: string }>(
    `select follow_id from contract_follows where contract_id = $1`,
    [contractId]
  )
  return followerIds.map((f) => f.follow_id)
}

export const getContractLikerIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const likedUserIds = await pg.manyOrNone<{ user_id: string }>(
    `select user_id from user_reactions
               where content_id = $1
               and content_type = 'contract'`,
    [contractId]
  )
  return likedUserIds.map((r) => r.user_id)
}

export const getContractGroupMemberIds = async (
  contractId: string,
  pg: SupabaseDirectClient
) => {
  const contractGroups = await pg.manyOrNone(
    `select distinct group_id  from group_contracts
                where contract_id = $1`,
    [contractId]
  )
  const groupIds = contractGroups.map((cg) => cg.group_id)

  if (groupIds.length === 0) return []
  const contractGroupMemberIds = await pg.manyOrNone<{ member_id: string }>(
    `select distinct member_id from group_members
                where group_id = any($1)`,
    [groupIds]
  )
  return contractGroupMemberIds.map((r) => r.member_id)
}

export const isContractNonPredictive = (contract: Contract) => {
  const isStonk = contract.outcomeType === 'STONK'
  if (isStonk) return true

  const questionIncludesDailyCoinflip =
    (contract.question.trim().toLowerCase().includes('coin') &&
      contract.question.trim().toLowerCase().includes('flip')) ||
    contract.question.trim().toLowerCase().includes('Daily 4 sided dice roll')
  if (questionIncludesDailyCoinflip) return true

  return contract.creatorUsername === 'ManifoldLove'
}

export const getContractPrivacyWhereSQLFilter = (
  uid: string | undefined,
  creatorId?: string,
  contractIdString = 'id'
) => {
  const otherVisibilitySQL = `
  OR (visibility = 'unlisted'
    AND (
     creator_id='${uid}'
     OR ${isAdminId(uid ?? '_')}
     OR exists(
         select 1 from contract_bets where contract_id = ${contractIdString} and user_id = '${uid}')
     ))`
  return !!creatorId && !!uid && creatorId === uid
    ? ''
    : `(visibility = 'public' ${uid ? otherVisibilitySQL : ''})`
}

export const getUsersWithAccessToContract = async (
  contract: Contract,
  pg: SupabaseDirectClient
): Promise<string[]> => {
  return await pg.map(
    `
    select member_id FROM group_members
    JOIN group_contracts ON group_members.group_id = group_contracts.group_id
    WHERE group_contracts.contract_id = $1
    `,
    [contract.id],
    (row: { member_id: string }) => row.member_id
  )
}

export const generateContractEmbeddings = async (
  contract: Contract,
  pg: SupabaseDirectClient
) => {
  const embedding = await generateEmbeddings(contract.question)
  if (!embedding) return

  return await pg.one(
    `insert into contract_embeddings (contract_id, embedding)
            values ($1, $2)
            on conflict (contract_id) do nothing
            returning embedding
          `,
    [contract.id, embedding]
  )
}

export const updateContract = async (
  pg: SupabaseDirectClient,
  contractId: string,
  update: DataUpdate<'contracts'>
) => {
  const fullUpdate = { ...update, id: contractId }
  const newContract = convertContract(
    await updateData(pg, 'contracts', 'id', fullUpdate)
  )
  log('updated contract', update)
  const updatedValues = mapValues(
    fullUpdate,
    (_, k) => newContract[k as keyof Contract] ?? null
  ) as any
  broadcastUpdatedContract(newContract.visibility, updatedValues)
  return newContract
}
