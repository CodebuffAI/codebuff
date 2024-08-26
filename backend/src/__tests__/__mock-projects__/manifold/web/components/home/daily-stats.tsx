import clsx from 'clsx'
import { User } from 'common/user'
import { Row } from 'web/components/layout/row'
import { QuestsOrStreak } from 'web/components/home/quests-or-streak'
import { DailyLeagueStat } from './daily-league-stat'
import { DailyProfit } from './daily-profit'

export const dailyStatsClass =
  'bg-canvas-0 rounded-lg px-3 py-1 shadow min-w-[60px]'

export function DailyStats(props: {
  user: User | null | undefined
  className?: string
}) {
  const { user, className } = props
  return (
    <Row className={clsx('items-center gap-3', className)}>
      <QuestsOrStreak user={user} />
      <DailyLeagueStat user={user} />
      <DailyProfit user={user} />
    </Row>
  )
}
