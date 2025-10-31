import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

import type { UserProfile } from '@/types/user'

const USER_PROFILE_STORAGE_KEY = 'codebuff-user-profile'

// Helper functions for local storage
const getUserProfileFromStorage = (): UserProfile | null => {
  if (typeof window === 'undefined') return null

  try {
    const stored = localStorage.getItem(USER_PROFILE_STORAGE_KEY)
    if (!stored) return null

    const parsed = JSON.parse(stored)
    // Convert created_at string back to Date if it exists
    if (parsed.created_at) {
      parsed.created_at = new Date(parsed.created_at)
    }
    return parsed
  } catch {
    return null
  }
}

const setUserProfileToStorage = (profile: UserProfile) => {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(USER_PROFILE_STORAGE_KEY, JSON.stringify(profile))
  } catch {
    // Silently fail if localStorage is not available
  }
}

const clearUserProfileFromStorage = () => {
  if (typeof window === 'undefined') return

  try {
    localStorage.removeItem(USER_PROFILE_STORAGE_KEY)
  } catch {
    // Silently fail if localStorage is not available
  }
}

export const useUserProfile = () => {
  const { data: session } = useSession()

  const query = useQuery<UserProfile>({
    queryKey: ['user-profile'],
    queryFn: async () => {
      const response = await fetch('/api/user/profile')
      if (!response.ok) {
        throw new Error('Failed to fetch user profile')
      }
      const data = await response.json()

      // Convert created_at string to Date if it exists
      if (data.created_at) {
        data.created_at = new Date(data.created_at)
      }

      return data
    },
    enabled: !!session?.user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    initialData: () => {
      // Return undefined if no data, which is compatible with useQuery
      return getUserProfileFromStorage() ?? undefined
    },
  })

  // Persist to localStorage whenever data changes
  useEffect(() => {
    if (query.data) {
      setUserProfileToStorage(query.data)
    }
  }, [query.data])

  // Clear localStorage when user logs out
  useEffect(() => {
    if (!session?.user) {
      clearUserProfileFromStorage()
    }
  }, [session?.user])

  return {
    ...query,
    clearCache: clearUserProfileFromStorage,
  }
}
