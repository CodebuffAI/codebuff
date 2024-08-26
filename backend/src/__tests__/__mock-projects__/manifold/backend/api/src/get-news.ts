import { convertDashboardSqltoTS } from 'common/dashboard'
import { createSupabaseClient } from 'shared/supabase/init'
import { APIError, jsonEndpoint } from './helpers/endpoint'

export const getnews = jsonEndpoint(async () => {
  const db = createSupabaseClient()
  const dash = await db
    .from('dashboards')
    .select()
    .neq('visibility', 'deleted')
    .gt('importance_score', 0)
    .order('importance_score', { ascending: false })

  if (dash.error)
    throw new APIError(500, 'Error fetching news' + dash.error.message)

  const groups = await db
    .from('dashboard_groups')
    .select('group_id, dashboard_id')
    .in(
      'dashboard_id',
      dash.data.map((d) => d.id)
    )

  if (groups.error)
    throw new APIError(500, 'Error fetching news groups' + groups.error.message)

  return dash.data.map((d) => ({
    ...convertDashboardSqltoTS(d),
    topics: groups.data
      .filter((g) => g.dashboard_id === d.id)
      .map((g) => g.group_id),
  }))
})
