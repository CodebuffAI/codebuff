import { createSupabaseDirectClient } from 'shared/supabase/init'
import { z } from 'zod'
import {
  APIError,
  type APIHandler,
  MaybeAuthedEndpoint,
  validate,
} from './helpers/endpoint'
import { convertDashboardSqltoTS } from 'common/dashboard'

const bodySchema = z
  .object({
    dashboardSlug: z.string(),
  })
  .strict()
export const getDashboardFromSlug: APIHandler<
  'get-dashboard-from-slug'
> = async (props) => {
  return await getDashboardFromSlugInternal(props.dashboardSlug)
}
export const getdashboardfromslug = MaybeAuthedEndpoint(async (req) => {
  const { dashboardSlug } = validate(bodySchema, req.body)
  return await getDashboardFromSlugInternal(dashboardSlug)
})

const getDashboardFromSlugInternal = async (dashboardSlug: string) => {
  const pg = createSupabaseDirectClient()
  const dash = await pg.oneOrNone(
    `select * from dashboards where slug = $1`,
    [dashboardSlug],
    (r) => (r ? convertDashboardSqltoTS(r) : null)
  )

  if (!dash) throw new APIError(404, 'Dashboard not found')
  const topics = await pg.map(
    `select group_id from dashboard_groups where dashboard_id = $1`,
    [dash.id],
    (r) => r.group_id as string
  )

  return {
    ...dash,
    topics,
  }
}
