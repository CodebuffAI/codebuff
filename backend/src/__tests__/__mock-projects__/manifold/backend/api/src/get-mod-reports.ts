import { ModReport } from 'common/mod-report'
import { type APIHandler } from './helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'

export const getModReports: APIHandler<'get-mod-reports'> = async () => {
  const pg = createSupabaseDirectClient()

  const reports = await pg.manyOrNone<ModReport>(`
    select
      mr.*,
      cc.data->'content' as comment_content,
      c.question as contract_question,
      c.slug as contract_slug,
      creator.username as creator_username,
      owner.username as owner_username,
      owner.data->>'avatarUrl' as owner_avatar_url,
      owner.name as owner_name,
      (owner.data->>'isBannedFromPosting')::boolean as owner_is_banned_from_posting
    from mod_reports mr
    join contract_comments cc on cc.comment_id = mr.comment_id
    join contracts c on c.id = mr.contract_id
    join users creator on creator.id = c.creator_id
    join users owner on owner.id = mr.user_id
  `)

  return { status: 'success', reports }
}
