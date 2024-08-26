import { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Contract } from 'common/contract'
import { convertContract } from 'common/supabase/contracts'
import { getMemberTopics } from 'shared/supabase/groups'
import { orderAndDedupeGroupContracts } from 'api/helpers/groups'

const CONTRACTS_PER_TOPIC = 5
export const getGroupsWithTopContracts: APIHandler<
  'get-groups-with-top-contracts'
> = async (_, auth) => {
  const pg = createSupabaseDirectClient()

  const [groupContracts, topics] = await Promise.all([
    pg.map(
      `
      with group_slugs as (
        select slug
        from groups as g
        join group_members as gm on g.id = gm.group_id
        where gm.member_id = $1
      )
      select gs.slug, c.data, c.importance_score
      from group_slugs as gs
      cross join lateral (
        select c.data, c.importance_score
        from contracts as c
        where c.visibility = 'public'
          and c.deleted = false
          and c.group_slugs @> array[gs.slug]
        order by c.importance_score desc
        limit $2
      ) as c
      order by gs.slug, c.importance_score desc
      `,
      [auth.uid, CONTRACTS_PER_TOPIC * 4],
      (row) => [row.slug, convertContract(row)] as [string, Contract]
    ),
    getMemberTopics(auth.uid, pg),
  ])

  const marketsByTopicSlug = orderAndDedupeGroupContracts(
    topics,
    groupContracts,
    CONTRACTS_PER_TOPIC
  )

  return topics.map((topic) => ({
    topic,
    contracts: (marketsByTopicSlug[topic.slug] ?? []).slice(
      0,
      CONTRACTS_PER_TOPIC
    ),
  }))
}
