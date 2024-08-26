import { db } from './db'
import { run, selectFrom } from 'common/supabase/utils'
import { type User } from 'common/user'
import { APIError, api } from '../api/api'
import { DAY_MS, WEEK_MS } from 'common/util/time'
import { HIDE_FROM_LEADERBOARD_USER_IDS } from 'common/envs/constants'
export type { DisplayUser } from 'common/api/user-types'

const defaultFields = ['id', 'name', 'username', 'avatarUrl'] as const

export async function getUserById(id: string) {
  return api('user/by-id/:id/lite', { id })
}

export async function getUserByUsername(username: string) {
  return api('user/:username/lite', { username })
}

export async function getFullUserByUsername(username: string) {
  return api('user/:username', { username })
}

export async function getFullUserById(id: string) {
  return api('user/by-id/:id', { id })
}

export async function getUserSafe(userId: string) {
  try {
    return await getFullUserById(userId)
  } catch (e) {
    if (e instanceof APIError && e.code === 404) {
      return null
    }
    throw e
  }
}

export async function getPrivateUserSafe() {
  try {
    return await api('me/private')
  } catch (e) {
    return null
  }
}

export async function searchUsers(prompt: string, limit: number) {
  return api('search-users', { term: prompt, limit: limit })
}

export async function getDisplayUsers(userIds: string[]) {
  // note: random order
  const { data } = await run(
    selectFrom(db, 'users', ...defaultFields, 'isBannedFromPosting').in(
      'id',
      userIds
    )
  )

  return data
}

// leaderboards

export async function getProfitRank(userId: string) {
  const { data } = await run(
    db.rpc('profit_rank', {
      uid: userId,
      excluded_ids: HIDE_FROM_LEADERBOARD_USER_IDS,
    })
  )
  return data
}

export async function getCreatorRank(userId: string) {
  const { data } = await run(db.rpc('creator_rank', { uid: userId }))
  return data
}

export async function getTopTraders() {
  // add extra for @acc, excluded users
  const { data } = await run(db.rpc('profit_leaderboard', { limit_n: 25 }))
  return data
}

export async function getTopCreators() {
  const { data } = await run(db.rpc('creator_leaderboard', { limit_n: 20 }))
  return data
}

export const getTotalPublicContractsCreated = async (userId: string) => {
  const { count } = await run(
    db
      .from('contracts')
      .select('*', { head: true, count: 'exact' })
      .eq('visibility', 'public')
      .eq('creator_id', userId)
  )
  return count
}

export const getContractsCreatedProgress = async (
  userId: string,
  minTraders = 0
) => {
  const currentDate = new Date()
  const startDate = new Date()

  startDate.setMonth(startDate.getMonth() - 2)

  const startIsoString = startDate.toISOString()
  const endIsoString = currentDate.toISOString()

  const { count } = await run(
    db
      .from('contracts')
      .select('*', { head: true, count: 'exact' })
      .eq('visibility', 'public')
      .eq('creator_id', userId)
      .gte('created_time', startIsoString)
      .lt('created_time', endIsoString)
      .not('mechanism', 'eq', 'none')
      .gte('data->uniqueBettorCount', minTraders)
  )
  return count
}

export async function getRecentlyActiveUsers(limit: number) {
  const { data } = await run(
    db
      .from('users')
      .select('data')
      .gt('data->>lastBetTime', Date.now() - DAY_MS)
      .lt('data->>createdTime', Date.now() - WEEK_MS)
      .limit(limit)
  )
  console.log('getRecentlyActiveUsers', data)
  return data.map((d) => d.data as User)
}
