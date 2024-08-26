import { createSupabaseDirectClient } from 'shared/supabase/init'
import { APIHandler } from './helpers/endpoint'
import { LiteGroup } from 'common/group'
import { convertGroup } from 'common/supabase/groups'

export const getContractTopics: APIHandler<
  'market/:contractId/groups'
> = async ({ contractId }) => {
  const pg = createSupabaseDirectClient()
  return await pg.map<LiteGroup>(
    `
    select g.id, g.slug, g.name, g.importance_score, g.privacy_status, g.total_members
    from groups g
    join group_contracts gc on g.id = gc.group_id
    where gc.contract_id = $1
    order by importance_score desc 
    `,
    [contractId],
    convertGroup
  )
}
