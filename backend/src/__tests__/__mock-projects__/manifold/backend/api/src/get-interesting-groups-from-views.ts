import type { APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Group } from 'common/group'

export const getInterestingGroupsFromViews: APIHandler<
  'get-interesting-groups-from-views'
> = async (props) => {
  const { userId, contractIds } = props
  const pg = createSupabaseDirectClient()
  return await pg.map(
    ` select g.id, g.data, g.importance_score, false as has_bet
            from
              groups g
                  join group_contracts gc on g.id = gc.group_id
            where gc.contract_id = any($2)
          union
          -- This case is for if we let users bet before seeing the welcome flow
          select g.id, g.data, g.importance_score, true as has_bet
          from
              groups g
                  join group_contracts gc on g.id = gc.group_id
                  join contract_bets cb on gc.contract_id = cb.contract_id
          where cb.user_id = $1
        `,
    [userId, contractIds],
    (groupData) => ({
      ...(groupData.data as Group),
      id: groupData.id,
      hasBet: groupData.has_bet,
      importanceScore: groupData.importance_score,
    })
  )
}
