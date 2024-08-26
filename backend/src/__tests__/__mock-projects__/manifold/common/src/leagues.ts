import { Row } from './supabase/utils'

export type season = (typeof SEASONS)[number]

export const SEASONS = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16
] as const
export const CURRENT_SEASON = SEASONS[SEASONS.length - 1]

export const LEAGUES_START = new Date('2023-05-01T00:00:00-07:00') // Pacific Daylight Time (PDT) as time zone offset

const SEASON_END_TIMES = [
  new Date('2023-06-01T12:06:23-07:00'),
  new Date('2023-07-01T12:22:53-07:00'),
  new Date('2023-08-01T17:05:29-07:00'),
  new Date('2023-09-01T20:20:04-07:00'),
  new Date('2023-10-01T11:17:16-07:00'),
  new Date('2023-11-01T14:01:38-07:00'),
  new Date('2023-12-01T14:02:25-08:00'),
  new Date('2024-01-01T19:06:12-08:00'),
  new Date('2024-02-01T17:51:49-08:00'),
  new Date('2024-03-01T15:30:22-08:00'),
  new Date('2024-04-01T21:43:18-08:00'),
  new Date('2024-05-01T16:32:08-07:00'),
  new Date('2024-06-01T11:10:19-07:00'),
  new Date('2024-07-01T18:41:35-07:00'),
  new Date('2024-08-01T22:11:54-07:00'),
]

export type League = {
  season: number
  division: number
  cohort: string
  rank: number
  createdTime: string
  manaEarned: number
  manaEarnedBreakdown: Record<number, number>
  userId: string
  rankSnapshot: number
}

export const getSeasonMonth = (season: number) => {
  return getSeasonDates(season).start.toLocaleString('default', {
    month: 'long',
  })
}

export const getSeasonDates = (season: number) => {
  const start = new Date(LEAGUES_START)
  start.setMonth(start.getMonth() + season - 1)

  let end: Date
  if (SEASON_END_TIMES[season - 1]) {
    end = new Date(SEASON_END_TIMES[season - 1])
  } else {
    end = new Date(LEAGUES_START)
    end.setMonth(end.getMonth() + season)
    // Add a day, though the random close time will be some time before this.
    end.setDate(end.getDate() + 1)
  }

  return { start, end }
}

export const getSeasonCountdownEnd = (season: number) => {
  const end = new Date(LEAGUES_START)
  end.setMonth(end.getMonth() + season)
  return end
}

export const getSeasonStatus = (season: number) => {
  const { start } = getSeasonDates(season)
  const countdownEnd = getSeasonCountdownEnd(season)
  const now = new Date()
  if (now < start) {
    return 'upcoming'
  } else if (now > countdownEnd) {
    if (!SEASON_END_TIMES[season - 1]) {
      return 'closing-period'
    }
    return 'ended'
  } else {
    return 'current'
  }
}

export const DIVISION_NAMES = {
  0: 'Silicon',
  1: 'Bronze',
  2: 'Silver',
  3: 'Gold',
  4: 'Platinum',
  5: 'Diamond',
  6: 'Masters',
} as { [key: number | string]: string }
const DIVISION_NAME_TO_NUMBER = Object.fromEntries(
  Object.entries(DIVISION_NAMES).map(([k, v]) => [v, +k])
) as { [key: string]: number }

export const SECRET_NEXT_DIVISION = '???'

export const getDivisionNumber = (division: string) => {
  const num = DIVISION_NAME_TO_NUMBER[division]
  if (num === undefined) throw new Error(`Invalid division: ${division}`)
  return num
}

export const getDemotionAndPromotionCount = (division: number) => {
  if (division === 0) {
    return { demotion: 0, promotion: 0, doublePromotion: 0 }
  }
  if (division === 1) {
    return { demotion: 0, promotion: 10, doublePromotion: 2 }
  }
  if (division === 2) {
    return { demotion: 5, promotion: 7, doublePromotion: 1 }
  }
  if (division === 3) {
    return { demotion: 6, promotion: 6, doublePromotion: 0 }
  }
  if (division === 4) {
    return { demotion: 10, promotion: 5, doublePromotion: 0 }
  }
  if (division === 5) {
    return { demotion: 10, promotion: 2, doublePromotion: 0 }
  }
  if (division === 6) {
    return { demotion: 19, promotion: 0, doublePromotion: 0 }
  }
  throw new Error(`Invalid division: ${division}`)
}

export const getDemotionAndPromotionCountBySeason = (
  season: number,
  division: number
) => {
  if (season === 14) {
    if (division === 6) {
      return { demotion: 18, promotion: 0, doublePromotion: 0 }
    }
  }
  if (season === 13) {
    if (division === 5) {
      return { demotion: 10, promotion: 2, doublePromotion: 0 }
    }
    if (division === 6) {
      return { demotion: 29, promotion: 0, doublePromotion: 0 }
    }
  }
  if (season > 8 && season < 13) {
    if (division === 5)
      return { demotion: 12, promotion: 3, doublePromotion: 0 }
  }
  if (season === 8) {
    if (division === 6)
      return { demotion: 34, promotion: 0, doublePromotion: 0 }
  }
  if (season === 6 || season === 7) {
    if (division === 3) {
      return { demotion: 5, promotion: 6, doublePromotion: 0 }
    }
    if (division === 6)
      return { demotion: 25, promotion: 0, doublePromotion: 0 }
  }
  if (season === 5) {
    if (division === 3) return { demotion: 5, promotion: 6, doublePromotion: 0 }
    if (division === 4) return { demotion: 5, promotion: 5, doublePromotion: 0 }
    if (division === 5) return { demotion: 8, promotion: 3, doublePromotion: 0 }
    if (division === 6)
      return { demotion: 25, promotion: 0, doublePromotion: 0 }
  }
  if (season === 4) {
    if (division === 3) return { demotion: 5, promotion: 6, doublePromotion: 0 }
    if (division === 4) return { demotion: 5, promotion: 5, doublePromotion: 0 }
    if (division === 5) return { demotion: 7, promotion: 4, doublePromotion: 0 }
    if (division === 6)
      return { demotion: 17, promotion: 0, doublePromotion: 0 }
  }
  if (season < 4) {
    if (division === 3) return { demotion: 5, promotion: 6, doublePromotion: 0 }
    if (division === 4) return { demotion: 5, promotion: 5, doublePromotion: 0 }
    if (division === 5) return { demotion: 6, promotion: 5, doublePromotion: 0 }
  }
  return getDemotionAndPromotionCount(division)
}

export const getDivisionChange = (
  division: number,
  rank: number,
  manaEarned: number,
  cohortSize: number
) => {
  const { demotion, promotion, doublePromotion } =
    getDemotionAndPromotionCount(division)

  // Require 100 mana earned to advance from Bronze.
  if (division === 1 && manaEarned < 100) {
    return 0
  }

  if (rank <= doublePromotion) {
    return 2
  }
  if (rank <= promotion) {
    return 1
  }
  if (rank > cohortSize - demotion) {
    return -1
  }
  return 0
}

export const getMaxDivisionBySeason = (season: number) => {
  if (season === 1) return 4
  if (season === 2) return 5
  return 6
}

export type league_row = Row<'leagues'>
export type league_user_info = league_row & { rank: number }

export const MAX_COHORT_SIZE = 100

export const getCohortSize = (division: number) => {
  if (division === getDivisionNumber('Bronze')) return 100
  if (division === getDivisionNumber('Silver')) return 50
  if (division === getDivisionNumber('Gold')) return 50
  if (division === getDivisionNumber('Masters')) return 100
  return 25
}

export const prizesByDivisionAndRank = [
  [1000, 500, 400, 300, 200, 100, 50],
  [2000, 1000, 900, 800, 700, 600, 500, 400],
  [4000, 2000, 1800, 1600, 1400, 1200, 1000, 800, 600],
  [8000, 4000, 3600, 3200, 2800, 2400, 2000, 1600, 1200, 800],
  [16000, 8000, 7200, 6400, 5600, 4800, 4000, 3200, 2400, 1600],
  [64000, 32000, 16000, 14400, 12800, 11200, 9600, 8000, 6400, 4800],
]

export const getLeaguePrize = (division: number, rank: number) => {
  const divisionPrizes = prizesByDivisionAndRank[division - 1]
  if (!divisionPrizes) return 0
  return divisionPrizes[rank - 1] || 0
}

export const getLeaguePath = (
  season: number,
  division: number,
  cohort: string,
  userId?: string
) => {
  const divisionName = DIVISION_NAMES[division].toLowerCase()
  return `/leagues/${season}/${divisionName}/${cohort}/${userId ?? ''}`
}

export const parseLeaguePath = (
  slugs: string[],
  rowsBySeason: { [season: number]: league_user_info[] },
  userId?: string
) => {
  const [seasonSlug, divisionSlug, cohortSlug, userIdSlug] = slugs
  let season = +seasonSlug
  if (!SEASONS.includes(season as season)) {
    season = CURRENT_SEASON
  }

  const seasonRows = rowsBySeason[season] ?? []
  const userIdToFind = userIdSlug || userId
  const userRow = seasonRows.find((row) => row.user_id === userIdToFind)

  let division: number
  if (Object.keys(DIVISION_NAMES).includes(divisionSlug)) {
    division = +divisionSlug
  } else {
    const divisionMatchingName = Object.keys(DIVISION_NAMES).find(
      (key) =>
        DIVISION_NAMES[key]?.toLowerCase() === divisionSlug?.toLowerCase()
    )
    if (divisionMatchingName) division = +divisionMatchingName
    else if (userRow) division = userRow.division
    else division = getMaxDivisionBySeason(season)
  }

  const divisionRows = seasonRows.filter((row) => row.division === division)
  const cohorts = divisionRows.map((row) => row.cohort)

  const cohort =
    cohorts.find((c) => c?.toLowerCase() === cohortSlug?.toLowerCase()) ??
    (userRow && userRow.division === division ? userRow.cohort : cohorts[0])

  const highlightedUserId =
    userRow && cohort === userRow.cohort ? userRow.user_id : undefined

  return {
    season,
    division,
    cohort,
    highlightedUserId,
  }
}

export const IS_BIDDING_PERIOD = Date.now() < 1691726400000 // August 11 0:00 PT
export const MIN_LEAGUE_BID = 50
export const MIN_BID_INCREASE_FACTOR = 1.2
