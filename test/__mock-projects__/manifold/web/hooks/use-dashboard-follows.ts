import { getUserFollowsDashboard } from 'common/supabase/dashboard-follows'
import { useEffect, useState } from 'react'
import { db } from 'web/lib/supabase/db'

export const useUserFollowsDashboard = (
  userId: string | undefined,
  dashboardId: string
) => {
  const [isFollowing, setIsFollowing] = useState<boolean | undefined>(undefined)
  useEffect(() => {
    if (userId) {
      getUserFollowsDashboard(userId, dashboardId, db).then((res) => {
        setIsFollowing(res)
      })
    }
  }, [userId, dashboardId])
  return { isFollowing, setIsFollowing }
}
