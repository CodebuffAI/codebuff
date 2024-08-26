import { useEffect } from 'react'

import { league_user_info } from 'common/leagues'
import {
  getLeagueChats,
  getLeagueInfo,
  getOwnedLeagueChats,
} from 'web/lib/supabase/leagues'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { usePersistentLocalState } from './use-persistent-local-state'

export const useLeagueInfo = (userId: string | null | undefined) => {
  const [leagueInfo, setLeagueInfo] = usePersistentLocalState<
    league_user_info | null | undefined
  >(undefined, `league-info-${userId}`)

  useEffect(() => {
    if (userId) {
      getLeagueInfo(userId).then((result) => {
        setLeagueInfo(result as league_user_info | null)
      })
    }
  }, [userId])

  return leagueInfo
}

export const useLeagueChats = (season: number) => {
  const [leagueChats, setLeagueChats] = usePersistentInMemoryState<any[]>(
    [],
    `league-chats-${season}`
  )

  useEffect(() => {
    getLeagueChats(season).then((result) => {
      setLeagueChats(result)
    })
  }, [season])

  return leagueChats
}
export const useOwnedLeagueChats = (
  season: number,
  userId: string | undefined
) => {
  const [leagueChats, setLeagueChats] = usePersistentInMemoryState<any[]>(
    [],
    `owned-league-chats-${season}`
  )

  useEffect(() => {
    if (!userId) return
    getOwnedLeagueChats(season, userId).then((result) => {
      setLeagueChats(result)
    })
  }, [season, userId])

  return leagueChats
}
