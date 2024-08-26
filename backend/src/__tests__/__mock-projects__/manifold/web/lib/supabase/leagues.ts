import { db } from './db'
import { CURRENT_SEASON, league_user_info } from 'common/leagues'
import { convertSQLtoTS, tsToMillis } from 'common/supabase/utils'

export async function getLeagueInfo(userId: string) {
  const { data } = await db
    .from('user_league_info')
    .select('*')
    .eq('user_id', userId)
    .eq('season', CURRENT_SEASON)
    .limit(1)
  if (data && data.length > 0) {
    return data[0]
  }
  return null
}

export async function getLeagueRows(season: number) {
  const { data: rows } = await db
    .from('user_league_info')
    .select('*')
    .filter('season', 'eq', season)
    .order('mana_earned', { ascending: false })
  return (rows ?? []) as league_user_info[]
}

export async function getLeagueChats(season: number) {
  const { data: rows } = await db
    .from('league_chats')
    .select('*')
    .eq('season', season)

  return (rows ?? []).map((r) => ({
    ...r,
    ownerId: r.owner_id,
    channelId: r.channel_id,
    createdTime: new Date(r.created_time).getTime(),
  }))
}
export async function getOwnedLeagueChats(season: number, ownerId: string) {
  const { data: rows } = await db
    .from('league_chats')
    .select('*')
    .eq('season', season)
    .eq('owner_id', ownerId)

  return (rows ?? []).map((r) =>
    convertSQLtoTS(r, {
      created_time: tsToMillis as any,
    })
  )
}
