import clsx from 'clsx'
import {
  ChevronDoubleDownIcon,
  ChevronDoubleUpIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from '@heroicons/react/solid'

import { Fragment, useState } from 'react'
import { Row } from '../layout/row'
import { DIVISION_NAMES, league_user_info } from 'common/leagues'
import { formatMoney } from 'common/util/format'
import { useUsers } from 'web/hooks/use-user-supabase'
import { Col } from '../layout/col'
import { InfoTooltip } from '../widgets/info-tooltip'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { UserAvatarAndBadge } from '../widgets/user-link'
import { ManaEarnedBreakdown } from './mana-earned-breakdown'
import { Tooltip } from '../widgets/tooltip'
import { DisplayUser } from 'common/api/user-types'
import { TRADE_TERM } from 'common/envs/constants'

export const CohortTable = (props: {
  season: number
  cohort: string
  rows: league_user_info[]
  highlightedUserId: string | undefined
  demotionCount: number
  promotionCount: number
  doublePromotionCount: number
}) => {
  const {
    season,
    cohort,
    rows,
    highlightedUserId,
    demotionCount,
    promotionCount,
    doublePromotionCount,
  } = props
  const users = useUsers(rows.map((row) => row.user_id))
  if (!users || users.length !== rows.length) return <LoadingIndicator />

  const division = rows[0].division
  const nextDivision = division + 1
  const nextNextDivision = division + 2
  const nextDivisionName = DIVISION_NAMES[nextDivision]
  const nextNextDivisionName = DIVISION_NAMES[nextNextDivision]
  const prevDivision = Math.max(division - 1, 1)
  const prevDivisionName = DIVISION_NAMES[prevDivision]

  const noPromotionDemotion = cohort === 'bots'
  const shouldTruncateZeros = division === 1 || division === 2 || division === 3

  const adjustedDoublePromotionCount =
    division === 1
      ? Math.min(
          rows.findLastIndex((row) => row.mana_earned >= 100) + 1,
          doublePromotionCount
        )
      : doublePromotionCount
  const adjustedPromotionCount =
    division === 1
      ? Math.min(
          rows.findLastIndex((row) => row.mana_earned >= 100) + 1,
          promotionCount
        )
      : promotionCount

  return (
    <Col>
      {division === 1 && (
        <div className="mb-4">Requires 100 mana earned to promote.</div>
      )}
      <table>
        <thead className={clsx('text-ink-600 text-left text-sm font-semibold')}>
          <tr>
            <th className={clsx('pb-1 pl-10 pr-2')}>User</th>
            <th className={clsx('px-2 pb-1 text-right sm:pr-10')}>
              <InfoTooltip
                text={`Includes both realized and unrealized profits from ${TRADE_TERM}s placed this month plus creator earnings.`}
              >
                Mana earned{' '}
              </InfoTooltip>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const user = users[i]
            if (!user) return null
            return (
              <Fragment key={user.id}>
                {user &&
                  (!shouldTruncateZeros ||
                    !!row.mana_earned ||
                    highlightedUserId === user.id) && (
                    <UserRow
                      {...row}
                      user={user}
                      isHighlighted={highlightedUserId === user.id}
                      mana_earned_breakdown={row.mana_earned_breakdown as any}
                      season={season}
                    />
                  )}
                {user &&
                  shouldTruncateZeros &&
                  row.mana_earned === 0 &&
                  (i === rows.length - 1 || rows[i + 1].mana_earned !== 0) && (
                    <tr>
                      <td className="pl-9">
                        <div className="">...</div>
                      </td>
                      <td />
                    </tr>
                  )}
                {!noPromotionDemotion && (
                  <>
                    {adjustedDoublePromotionCount > 0 &&
                      i + 1 === adjustedDoublePromotionCount && (
                        <tr>
                          <td colSpan={2}>
                            <Col className="mb-2 w-full items-center gap-1">
                              <div className="text-ink-500 text-xs">
                                ▲ Promotes to {nextNextDivisionName}{' '}
                              </div>
                              <div className="border-ink-300 w-full border-t-2 border-dashed" />
                            </Col>
                          </td>
                        </tr>
                      )}
                    {adjustedDoublePromotionCount !== adjustedPromotionCount &&
                      adjustedPromotionCount > 0 &&
                      i + 1 === adjustedPromotionCount && (
                        <tr>
                          <td colSpan={2}>
                            <Col className="mb-2 w-full items-center gap-1">
                              <div className="text-ink-500 text-xs">
                                ▲ Promotes to {nextDivisionName}
                              </div>
                              <div className="border-ink-300 w-full border-t-2 border-dashed" />
                            </Col>
                          </td>
                        </tr>
                      )}
                    {demotionCount > 0 &&
                      rows.length - (i + 1) === demotionCount && (
                        <tr>
                          <td colSpan={2}>
                            <Col className="mt-2 w-full items-center gap-1">
                              <div className="border-ink-300 w-full border-t-2 border-dashed" />
                              <div className="text-ink-500 text-xs">
                                ▼ Demotes to {prevDivisionName}
                              </div>
                            </Col>
                          </td>
                        </tr>
                      )}
                  </>
                )}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </Col>
  )
}

const UserRow = (props: {
  user: DisplayUser
  season: number
  mana_earned: number
  mana_earned_breakdown: { [key: string]: number }
  rank: number
  rank_snapshot: number | null
  isHighlighted: boolean
}) => {
  const {
    user,
    season,
    mana_earned,
    mana_earned_breakdown,
    rank,
    rank_snapshot,
    isHighlighted,
  } = props

  const [showDialog, setShowDialog] = useState(false)

  const rankDiff = rank_snapshot ? rank - rank_snapshot : 0

  return (
    <tr
      className={clsx(
        'hover:bg-primary-100 group cursor-pointer',
        isHighlighted && 'bg-primary-100 sticky bottom-[58px] lg:bottom-0'
      )}
      onClick={() => {
        setShowDialog(true)
      }}
    >
      <td className="pl-2">
        <Row className="my-2 items-center gap-4">
          <Tooltip
            text={
              rankDiff
                ? `${rankDiff < 0 ? 'Gained' : 'Lost'} ${Math.abs(
                    rankDiff
                  )} rank${Math.abs(rankDiff) > 1 ? 's' : ''} today`
                : undefined
            }
          >
            <Row>
              {rankDiff < -1 ? (
                <ChevronDoubleUpIcon className="h-6 w-6 text-teal-500" />
              ) : rankDiff === -1 ? (
                <ChevronUpIcon className="h-6 w-6 text-teal-500" />
              ) : rankDiff === 1 ? (
                <ChevronDownIcon className="text-scarlet-500 h-6 w-6" />
              ) : rankDiff > 1 ? (
                <ChevronDoubleDownIcon className="text-scarlet-500 h-6 w-6" />
              ) : (
                <div className="h-6 w-6" />
              )}
              <div className="w-4 text-right font-semibold">{rank}</div>
            </Row>
          </Tooltip>
          <UserAvatarAndBadge user={user} noLink />
        </Row>
      </td>
      <td className="pr-2 text-right sm:pr-10">{formatMoney(mana_earned)}</td>

      {showDialog && (
        <ManaEarnedBreakdown
          user={user}
          season={season}
          showDialog={showDialog}
          setShowDialog={setShowDialog}
          mana_earned={mana_earned}
          mana_earned_breakdown={mana_earned_breakdown}
        />
      )}
    </tr>
  )
}
