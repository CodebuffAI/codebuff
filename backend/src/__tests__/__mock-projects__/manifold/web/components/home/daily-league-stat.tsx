import Link from 'next/link'

import { User } from 'common/user'
import { Col } from '../layout/col'
import { useLeagueInfo } from 'web/hooks/use-leagues'
import { DIVISION_NAMES } from 'common/leagues'
import { dailyStatsClass } from 'web/components/home/daily-stats'
import clsx from 'clsx'
import { track } from 'web/lib/service/analytics'

export const DailyLeagueStat = (props: { user: User | null | undefined }) => {
  const { user } = props
  const info = useLeagueInfo(user?.id)

  if (!info || info.division === undefined) {
    return null
  }
  const name = DIVISION_NAMES[info.division]
  return (
    <Link
      prefetch={false}
      href="/leagues"
      onClick={() => track('click daily leagues button')}
    >
      <Col className={clsx(dailyStatsClass, 'relative items-center')}>
        <div className="whitespace-nowrap">
          {name === 'Bronze'
            ? '🥉'
            : name === 'Silver'
            ? '🥈'
            : name === 'Gold'
            ? '🥇'
            : name === 'Platinum'
            ? '💿'
            : name === 'Diamond'
            ? '💎'
            : name === 'Masters'
            ? '🎖️'
            : '🏅'}{' '}
          {info.rank}
        </div>
        <div className="text-ink-600 text-xs">
          {DIVISION_NAMES[info.division]}
        </div>
      </Col>
    </Link>
  )
}
