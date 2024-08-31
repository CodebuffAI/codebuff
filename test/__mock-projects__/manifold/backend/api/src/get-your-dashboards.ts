import { createSupabaseClient } from 'shared/supabase/init'
import { authEndpoint } from './helpers/endpoint'
import { run } from 'common/supabase/utils'
import { convertDashboardSqltoTS } from 'common/dashboard'

export const getyourdashboards = authEndpoint(async (_, auth) => {
  if (!auth.uid) {
    return { dashboards: [] }
  }
  const db = createSupabaseClient()
  const { data } = await run(
    db.from('dashboards').select('*').eq('creator_id', auth.uid)
  )

  return { dashboards: data.map(convertDashboardSqltoTS) }
})
