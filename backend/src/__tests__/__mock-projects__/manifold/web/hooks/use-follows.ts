import { useEffect, useState, useCallback } from 'react'
import {
  getUserIdFollows,
  getUserFollowers,
  getUserIsFollowing,
} from 'web/lib/supabase/follows'
import { usePersistentLocalState } from './use-persistent-local-state'
import { db } from 'web/lib/supabase/db'
import { followUser, unfollowUser } from 'web/lib/api/api'
import toast from 'react-hot-toast'

export const useFollows = (userId: string | null | undefined) => {
  const [follows, setFollows] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    if (userId) {
      getUserIdFollows(userId).then((data) => {
        setFollows(data?.map((r) => r.follow_id) ?? [])
      })
    } else {
      setFollows(undefined)
    }
  }, [userId])

  return follows
}

export const useFollowers = (userId: string | undefined) => {
  const [followers, setFollowers] = useState<string[] | undefined>(undefined)

  useEffect(() => {
    if (userId) {
      getUserFollowers(userId).then((data) => {
        setFollowers(data?.map((r) => r.user_id) ?? [])
      })
    } else {
      setFollowers(undefined)
    }
  }, [userId])

  return followers
}

export const useIsFollowing = (
  userId: string | undefined,
  followId: string
) => {
  const [isFollowing, setIsFollowing] = useState<boolean>(false)

  useEffect(() => {
    if (userId) {
      getUserIsFollowing(userId, followId).then(setIsFollowing)
    }
  }, [userId, followId])

  const toggleFollow = useCallback(async () => {
    if (!userId) return

    try {
      if (isFollowing) {
        setIsFollowing(false)
        await unfollowUser(followId)
      } else {
        setIsFollowing(true)
        await followUser(followId)
      }
    } catch (error) {
      setIsFollowing(!isFollowing) // undo the optimistic update
      toast.error('Failed to follow user. Please try again.')
      console.error(error)
    }
  }, [userId, followId, isFollowing])

  return { isFollowing, toggleFollow }
}

export const useFollowedIdsSupabase = (userId: string) => {
  const [followedIds, setFollowedIds] = usePersistentLocalState<
    string[] | undefined
  >(undefined, `user-followed-${userId}`)
  useEffect(() => {
    db.from('user_follows')
      .select('follow_id')
      .eq('user_id', userId)
      .then((res) => {
        setFollowedIds(res.data?.map((r) => r.follow_id))
      })
  }, [userId])
  return followedIds
}
