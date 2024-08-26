import { createSupabaseDirectClient } from 'shared/supabase/init'
import { authEndpoint } from './helpers/endpoint'
import { convertDashboardSqltoTS } from 'common/dashboard'

export const getyourfolloweddashboards = authEndpoint(async (_, auth) => {
  if (!auth.uid) {
    return { dashboards: [] }
  }
  const pg = createSupabaseDirectClient()
  const data = await pg.manyOrNone(
    'SELECT dashboards.* from dashboards join dashboard_follows on dashboard_follows.dashboard_id = dashboards.id where dashboard_follows.follower_id = $1 order by dashboards.importance_score desc',
    [auth.uid]
  )

  if (data) {
    return { dashboards: data.map(convertDashboardSqltoTS) }
  }
  return { dashboards: [] }
})
