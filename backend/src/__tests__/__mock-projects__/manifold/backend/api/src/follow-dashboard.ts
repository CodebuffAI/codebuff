import { getUserFollowsDashboard } from 'common/supabase/dashboard-follows'
import { run } from 'common/supabase/utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { z } from 'zod'
import { authEndpoint } from './helpers/endpoint'

const schema = z
  .object({
    dashboardId: z.string(),
  })
  .strict()

export const followdashboard = authEndpoint(async (req, auth) => {
  const { dashboardId } = schema.parse(req.body)
  const followerId = auth.uid

  const db = createSupabaseClient()

  const isFollowing = await getUserFollowsDashboard(followerId, dashboardId, db)

  const query = isFollowing
    ? db
        .from('dashboard_follows')
        .delete()
        .eq('dashboard_id', dashboardId)
        .eq('follower_id', followerId)
    : db
        .from('dashboard_follows')
        .upsert([{ dashboard_id: dashboardId, follower_id: followerId }])

  await run(query)

  return { isFollowing: !isFollowing }
})
