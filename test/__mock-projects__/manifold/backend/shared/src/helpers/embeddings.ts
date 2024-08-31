import {
  createSupabaseDirectClient,
  SupabaseDirectClient,
} from 'shared/supabase/init'
import { ITask } from 'pg-promise'
import { chunk, mean, sum, zip } from 'lodash'
import { bulkUpdate } from 'shared/supabase/utils'
import { log } from 'shared/utils'
import { getMostlyActiveUserIds } from 'shared/supabase/users'
import { HIDE_FROM_NEW_USER_SLUGS } from 'common/envs/constants'

export const TOPIC_SIMILARITY_THRESHOLD = 0.5

function magnitude(vector: number[]): number {
  const vectorSum = sum(vector.map((val) => val * val))
  return Math.sqrt(vectorSum)
}
function normalize(vector: number[]): number[] {
  const mag = magnitude(vector)
  return vector.map((val) => val / mag)
}

export function normalizeAndAverageVectors(vectors: number[][]): number[] {
  const zipped = zip(...vectors)
  return normalize(zipped.map((vals) => mean(vals)))
}

async function normalizeOrGetDefault(
  pg: SupabaseDirectClient | ITask<any>,
  embedding: string | null
) {
  if (embedding === null) return await getDefaultEmbedding(pg)
  return normalize(JSON.parse(embedding) as number[])
}

export async function getDefaultEmbedding(
  pg: SupabaseDirectClient | ITask<any>
) {
  const avg = await pg.one<{ average_embedding: string }>(
    `
       select avg(embedding) as average_embedding
       from (
          select contract_embeddings.embedding
          from contract_embeddings
                   join (
              select id
              from contracts
                where group_slugs is not null
                and not exists (
                select 1
                from unnest(group_slugs) as t(slug)
                where (slug = any($1) or slug ilike '%manifold%')
                )
              order by importance_score desc
              limit 25
          ) as top_contracts on top_contracts.id = contract_embeddings.contract_id
        ) as subquery
    `,
    [HIDE_FROM_NEW_USER_SLUGS]
  )
  return normalize(JSON.parse(avg.average_embedding) as number[])
}

export async function upsertGroupEmbedding(
  pg: SupabaseDirectClient,
  groupId: string
) {
  const groupContractIds = await pg.map(
    `select contract_id from group_contracts where group_id = $1`,
    [groupId],
    (r: { contract_id: string }) => r.contract_id
  )
  const embed = await getAverageContractEmbedding(pg, groupContractIds)
  if (!embed) return
  await pg.none(
    'insert into group_embeddings (group_id, embedding) values ($1, $2) on conflict (group_id) do update set embedding = $2',
    [groupId, embed]
  )
  log('Upserted group embedding for', groupId)
}

export async function getAverageGroupEmbedding(
  pg: SupabaseDirectClient,
  groupIds: string[] | undefined
) {
  if (!groupIds || groupIds.length === 0) {
    return null
  }
  return await pg.one(
    `select avg(embedding) as average_embedding
            from group_embeddings where group_id = any($1)`,
    [groupIds],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) return null
      return normalize(JSON.parse(r.average_embedding) as number[])
    }
  )
}

export async function getAverageContractEmbedding(
  pg: SupabaseDirectClient,
  contractIds: string[] | undefined
) {
  if (!contractIds || contractIds.length === 0) {
    return null
  }

  return await pg.one(
    `select avg(embedding) as average_embedding
    from contract_embeddings
    where contract_id = any($1)`,
    [contractIds],
    async (r: { average_embedding: string }) => {
      if (r.average_embedding === null) return null
      return normalize(JSON.parse(r.average_embedding) as number[])
    }
  )
}

export async function updateUserInterestEmbedding(
  pg: SupabaseDirectClient,
  userId: string
) {
  await pg.task('update-user-embedding', async (pg) => {
    const interestedContractIds = await getInterestedContractIds(pg, userId)
    const interestEmbedding = await computeUserInterestEmbedding(
      pg,
      userId,
      interestedContractIds
    )

    await pg.none(
      `insert into user_embeddings (user_id, interest_embedding)
                values ($1, $2)
                on conflict (user_id) do update set interest_embedding = $2`,
      [userId, interestEmbedding]
    )
  })
}

export async function addContractToUserDisinterestEmbedding(
  pg: SupabaseDirectClient,
  userId: string,
  contractId: string,
  creatorId: string,
  feedId?: number,
  removeContract?: boolean
) {
  await pg.task('update-user-disinterest-embedding', async (pg) => {
    if (removeContract) {
      await pg.none(
        `delete from user_disinterests
                where user_id = $1 and contract_id = $2 and creator_id = $3 and feed_id = $4`,
        [userId, contractId, creatorId, feedId]
      )
    } else
      await pg.none(
        `insert into user_disinterests (user_id, contract_id, creator_id, feed_id)
              values ($1, $2, $3, $4)`,
        [userId, contractId, creatorId, feedId]
      )
  })
  await updateUserDisinterestEmbeddingInternal(pg, userId)
}

export async function updateUserDisinterestEmbeddingInternal(
  pg: SupabaseDirectClient,
  userId: string
) {
  const disinterestedContractIds = await getDisinterestedContractIds(pg, userId)
  const disinterestEmbedding = await computeUserDisinterestEmbedding(
    pg,
    userId,
    disinterestedContractIds
  )

  await pg.none(
    'UPDATE user_embeddings SET disinterest_embedding = $2 WHERE user_id = $1',
    [userId, disinterestEmbedding]
  )
}

async function getInterestedContractIds(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string
) {
  // Get contract ids that you bet on or liked.
  return await pg.map(
    `select contract_id from (
      select contract_id, max(created_time) as created_time from contract_bets
      where user_id = $1
      group by contract_id
      order by created_time desc
      limit 1000
     ) as bet_on_contract_ids
     union
     select distinct content_id as contract_id from user_reactions
     where user_id = $1 and user_reactions.content_type = 'contract'
     limit 1000
    `,
    [userId],
    (r: { contract_id: string }) => r.contract_id
  )
}

async function getDisinterestedContractIds(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string
) {
  // Get contract ids that you bet on or liked.
  return await pg.map(
    `select contract_id from
      user_disinterests
      where user_id = $1
    `,
    [userId],
    (r: { contract_id: string }) => r.contract_id
  )
}

async function computeUserInterestEmbedding(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string,
  contractIds: string[]
) {
  return await pg.one(
    `with combined_embeddings as (
      select embedding as combined_embedding
      from contract_embeddings
      where contract_id = any($1)
      union all
      -- Append user's topic embeddings twice to be averaged in.
      select topic_embedding as combined_embedding
      from user_topics
      where user_id = $2
      union all
      select topic_embedding as combined_embedding
      from user_topics
      where user_id = $2
      union all
      -- Append user's viewed contracts interest embeddings once to be averaged in.
      select contract_view_embedding as combined_embedding
      from user_embeddings
      where user_id = $2
      union all
      -- TODO: perhaps select unique group embeddings of group contracts,
      -- otherwise group contracts like Technology/Science will be overrepresented.
      -- Append group embeddings of bet-on contracts to be averaged in.
      select embedding as combined_embedding
      from group_embeddings
      where group_id = any(
      (select group_id from group_contracts where contract_id = any($1)))
      union all
      -- Append group embeddings of groups joined to be averaged in.
      select embedding as combined_embedding
      from group_embeddings
      where group_id = any(
      (select group_id from group_members where member_id = $2)
     ))
    select avg(combined_embedding) as average_embedding
    from combined_embeddings`,
    [contractIds, userId],
    async (r: { average_embedding: string }) =>
      normalizeOrGetDefault(pg, r.average_embedding)
  )
}

async function computeUserDisinterestEmbedding(
  pg: SupabaseDirectClient | ITask<any>,
  userId: string,
  contractIds: string[]
) {
  return await pg.one(
    `
      select avg(embedding) as average_embedding
      from contract_embeddings
      where contract_id = any($1)
    `,
    [contractIds, userId],
    async (r: { average_embedding: string }) =>
      normalizeOrGetDefault(pg, r.average_embedding)
  )
}

export async function updateViewsAndViewersEmbeddings() {
  const pg = createSupabaseDirectClient()
  const userToEmbeddingMap: { [userId: string]: number[] | null } = {}
  const viewerIds = await getMostlyActiveUserIds(pg)
  log('Found', viewerIds.length, 'viewers to update')

  await pg.map(
    `
    select
        a.user_id,
        a.average_embedding as contract_view_average_embedding,
        b.average_embedding as group_view_average_embedding
    from
        (
            -- Contract view embeddings
            select
                user_contract_views.user_id,
                avg(contract_embeddings.embedding) as average_embedding
            from
                contract_embeddings
                    join user_contract_views on user_contract_views.contract_id = contract_embeddings.contract_id
            where
                user_contract_views.user_id in ($1:list)
              and user_contract_views.page_views > 0
            group by
                user_contract_views.user_id
        ) as a
            left join
        (
            -- Group view embeddings (Groups of contracts viewed by user)
            select
                user_contract_views.user_id,
                avg(group_embeddings.embedding) as average_embedding
            from
                group_embeddings
                    join group_contracts on group_contracts.group_id = group_embeddings.group_id
                    join user_contract_views on user_contract_views.contract_id = group_contracts.contract_id
            where
                user_contract_views.user_id in ($1:list)
              and user_contract_views.page_views > 0
            group by
                user_contract_views.user_id
        ) as b on a.user_id = b.user_id;
    `,
    [viewerIds],
    (r: {
      user_id: string
      contract_view_average_embedding: string | null
      group_view_average_embedding: string | null
    }) => {
      const normAverage = normalizeAndAverageVectors([
        normalize(
          JSON.parse(r.contract_view_average_embedding ?? '[]') as number[]
        ),
        normalize(
          JSON.parse(r.group_view_average_embedding ?? '[]') as number[]
        ),
      ])
      if (normAverage.length > 0) userToEmbeddingMap[r.user_id] = normAverage
    }
  )
  log(
    'Found',
    Object.keys(userToEmbeddingMap).length,
    'view embedding updates to write'
  )
  await bulkUpdate(
    pg,
    'user_embeddings',
    ['user_id'],
    Object.keys(userToEmbeddingMap).map((userId) => ({
      user_id: userId,
      contract_view_embedding: userToEmbeddingMap[userId] as any,
    }))
  )
  log('Updated user view embeddings')
  // chunk users to update their interest embeddings
  const chunkSize = 500
  const chunks = chunk(Object.keys(userToEmbeddingMap), chunkSize)
  log('Updating interest embeddings for', chunks.length, 'chunks')
  for (const chunk of chunks) {
    await Promise.all(
      chunk.map((userId) => updateUserInterestEmbedding(pg, userId))
    )
    log('Updated interest embeddings for chunk of', chunk.length, 'users')
  }
}
