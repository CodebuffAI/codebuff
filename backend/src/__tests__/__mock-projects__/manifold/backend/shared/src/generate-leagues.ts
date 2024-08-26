import { groupBy, shuffle } from 'lodash'
import { pgp, SupabaseDirectClient } from './supabase/init'
import { genNewAdjectiveAnimal } from 'common/util/adjective-animal'
import { BOT_USERNAMES, OPTED_OUT_OF_LEAGUES } from 'common/envs/constants'
import {
  CURRENT_SEASON,
  getCohortSize,
  getDivisionChange,
  getSeasonDates,
  league_user_info,
  MAX_COHORT_SIZE,
  SEASONS,
} from 'common/leagues'
import { getCurrentPortfolio } from './helpers/portfolio'
import { createLeagueChangedNotification } from 'shared/create-notification'
import { bulkInsert } from './supabase/utils'
import { log } from './utils'

export async function generateNextSeason(
  pg: SupabaseDirectClient,
  season: number
) {
  console.log('Generating season', season)
  const prevSeason = season - 1
  const startDate = getSeasonDates(prevSeason).start
  const rows = await pg.manyOrNone<league_user_info>(
    `select * from user_league_info
    where season = $1
    order by mana_earned desc`,
    [prevSeason]
  )

  const activeUserIds = await pg.manyOrNone<{ user_id: string }>(
    `with active_user_ids as (
      select distinct user_id
      from contract_bets
      where contract_bets.created_time > $1
    )
    select user_id from active_user_ids
    join users on users.id = user_id
    where coalesce(users.data->>'isBannedFromPosting', 'false') = 'false'
    and coalesce(users.data->>'userDeleted', 'false') = 'false'
    and users.username not in ($2:csv)
    `,
    [startDate, BOT_USERNAMES]
  )
  const activeUserIdsSet = new Set(activeUserIds.map((u) => u.user_id))

  const usersByDivision = generateDivisions(rows, activeUserIdsSet)
  console.log('usersByDivision', usersByDivision)

  const userCohorts = await generateCohorts(pg, usersByDivision)
  console.log('user cohorts', userCohorts)

  const leagueInserts = Object.entries(userCohorts).map(
    ([userId, { division, cohort }]) => ({
      user_id: userId,
      season,
      division,
      cohort,
    })
  )
  console.log('league inserts', leagueInserts)
  console.log('Inserting', leagueInserts.length, 'cohort rows')

  // Bulk insert leagues.
  const insertStatement =
    pgp.helpers.insert(
      leagueInserts,
      Object.keys(leagueInserts[0]),
      'leagues'
    ) +
    ` on conflict (user_id, season) do update set
    division = excluded.division,
    cohort = excluded.cohort`
  await pg.none(insertStatement)
}

const generateDivisions = (
  rows: league_user_info[],
  activeUserIds: Set<string>
) => {
  const usersByNewDivision: Record<number, string[]> = {}

  const rowsByCohort = groupBy(rows, 'cohort')
  const activeRows = rows.filter((r) => activeUserIds.has(r.user_id))
  console.log('rows', rows.length, 'active rows', activeRows.length)

  for (const row of activeRows) {
    const { user_id, division, cohort, rank, mana_earned } = row

    const cohortRows = rowsByCohort[cohort]

    let change = getDivisionChange(
      division,
      rank,
      mana_earned,
      cohortRows.length
    )
    if (change > 0 && mana_earned <= 0) change = 0

    const newDivision = division + change

    if (!usersByNewDivision[newDivision]) usersByNewDivision[newDivision] = []
    usersByNewDivision[newDivision].push(user_id)
  }

  return usersByNewDivision
}

const generateCohorts = async (
  pg: SupabaseDirectClient,
  usersByDivision: { [division: number]: string[] }
) => {
  const userCohorts: {
    [userId: string]: { division: number; cohort: string }
  } = {}
  const cohortSet = new Set<string>()

  for (const divisionStr in usersByDivision) {
    const divisionUserIds = usersByDivision[divisionStr]
    const division = Number(divisionStr)
    const cohortSize = getCohortSize(division)
    const numCohorts = Math.ceil(divisionUserIds.length / cohortSize)
    const usersPerCohort = Math.ceil(divisionUserIds.length / numCohorts)
    const cohortsWithOneLess =
      usersPerCohort * numCohorts - divisionUserIds.length
    console.log(
      'division users',
      divisionUserIds.length,
      'numCohorts',
      numCohorts,
      'usersPerCohort',
      usersPerCohort,
      'cohortsWithOneLess',
      cohortsWithOneLess
    )

    let remainingUserIds = shuffle(divisionUserIds.concat())
    let i = 0
    while (remainingUserIds.length > 0) {
      const cohortSize =
        i < cohortsWithOneLess ? usersPerCohort - 1 : usersPerCohort
      const cohortOfUsers = remainingUserIds.slice(0, cohortSize)

      const cohort = genNewAdjectiveAnimal(cohortSet)
      cohortSet.add(cohort)

      for (const userId of cohortOfUsers) {
        userCohorts[userId] = { division, cohort }
      }
      remainingUserIds = divisionUserIds.filter((uid) => !userCohorts[uid])
      i++
      console.log('cohort', cohort, cohortOfUsers.length)
    }
  }

  return userCohorts
}

export const insertBots = async (pg: SupabaseDirectClient, season: number) => {
  const prevSeason = season - 1

  // const alreadyAssignedBotIds = await pg.map(
  //   `delete from leagues
  //   where season = $1
  //   and user_id in (
  //     select id from users
  //     where data.username in ($2:csv)
  //   )
  //   `,
  //   [season, BOT_USERNAMES],
  //   (r) => r.user_id
  // )

  // console.log('alreadyAssignedBotIds', alreadyAssignedBotIds)

  const botUsernamesExcludingAcc = BOT_USERNAMES.filter((u) => u !== 'acc')
  const startDate = getSeasonDates(prevSeason).start
  const botIds = await pg.map(
    `with active_user_ids as (
        select distinct user_id
        from contract_bets
        where contract_bets.created_time > $1
      )
      select id from users
      where users.username in ($2:csv)
      and id in (select user_id from active_user_ids)
    `,
    [startDate, botUsernamesExcludingAcc],
    (r) => r.id
  )

  console.log('botIds', botIds)
  const botInserts = botIds.map((id) => ({
    user_id: id,
    season,
    division: 0,
    cohort: 'prophetic-programs',
  }))
  console.log('botInserts', botInserts)
  await bulkInsert(pg, 'leagues', botInserts)
}

const getSmallestCohort = async (
  pg: SupabaseDirectClient,
  season: number,
  division: number
) => {
  return await pg.oneOrNone<{ cohort: string; count: number }>(
    `select cohort, count(user_id) as count from leagues
    where season = $1
      and division = $2
    group by cohort
    order by count(user_id) ASC
    limit 1`,
    [season, division]
  )
}

const generateNewCohortName = async (
  pg: SupabaseDirectClient,
  season: number
) => {
  const cohortData = await pg.many<{ cohort: string }>(
    `select distinct cohort from leagues where season = $1`,
    [season]
  )
  const cohortSet = new Set(cohortData.map((d) => d.cohort))
  return genNewAdjectiveAnimal(cohortSet)
}

const addUserToLeague = async (
  pg: SupabaseDirectClient,
  userId: string,
  season: number,
  division: number
) => {
  const data = await getSmallestCohort(pg, season, division)
  if (!data) return
  const { cohort: smallestCohort, count } = data

  const cohort =
    count >= MAX_COHORT_SIZE
      ? await generateNewCohortName(pg, season)
      : smallestCohort

  console.log(
    'Inserting user',
    userId,
    'into division',
    division,
    'cohort',
    cohort
  )

  await pg.none(
    `insert into leagues (user_id, season, division, cohort)
      values ($1, $2, $3, $4)`,
    [userId, season, division, cohort]
  )
  return { season, division, cohort, userId }
}

export const getUsersNotInLeague = async (
  pg: SupabaseDirectClient,
  season: number
) => {
  const rows = await pg.manyOrNone<{ id: string }>(
    `
    select distinct users.id
    from users
    left join leagues on users.id = leagues.user_id
    join contract_bets cb on users.id = cb.user_id
    where
      (leagues.user_id is null or leagues.season != $1)
      and cb.created_time > to_date('20230501', 'YYYYMMDD')
    `,
    [season]
  )
  return rows.map((r) => r.id)
}

const portfolioToDivision = (portfolio: {
  balance: number
  investmentValue: number
}) => {
  const value = portfolio.balance + portfolio.investmentValue
  if (value < 1500) return 1
  if (value < 5000) return 2
  return 3
}

export const addToLeagueIfNotInOne = async (
  pg: SupabaseDirectClient,
  userId: string
) => {
  if (OPTED_OUT_OF_LEAGUES.includes(userId)) {
    log('User opted out of leagues', userId)
    return
  }

  const season = SEASONS[SEASONS.length - 1]

  const existingLeague = await pg.oneOrNone<{
    season: number
    division: number
    cohort: string
  }>(
    `select season, division, cohort from leagues where user_id = $1 and season = $2`,
    [userId, season]
  )
  if (existingLeague) {
    return existingLeague
  }

  const portfolio = await getCurrentPortfolio(pg, userId)
  const division = portfolio ? portfolioToDivision(portfolio) : 1
  const data = await addUserToLeague(pg, userId, season, division)
  if (!data) return
  const cohort = data.cohort

  await createLeagueChangedNotification(
    userId,
    undefined,
    { season, division, cohort },
    0,
    pg
  )
  return { season, division, cohort }
}

export const addNewUserToLeague = async (
  pg: SupabaseDirectClient,
  userId: string
) => {
  const data = await addUserToLeague(pg, userId, CURRENT_SEASON, 1)
  if (!data) return
  const { season, division, cohort } = data
  await createLeagueChangedNotification(
    userId,
    undefined,
    { season, division, cohort },
    0,
    pg
  )
}
