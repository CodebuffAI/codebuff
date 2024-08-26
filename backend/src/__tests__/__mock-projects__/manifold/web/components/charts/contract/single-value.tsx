import { HistoryPoint } from 'common/chart'
import { TooltipProps, formatDateInRange, formatPct } from '../helpers'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserHovercard } from 'web/components/user/user-hovercard'

// for markets over a single value

export type SingleContractPoint = HistoryPoint<{
  userAvatarUrl?: string
  userId?: string
}>

export const SingleContractChartTooltip = (props: {
  ttProps: TooltipProps<SingleContractPoint>
  xScale: any
  formatY: (y: number) => string
}) => {
  const { ttProps, xScale, formatY } = props
  const { prev, next, x } = ttProps
  if (!prev) return null

  const d = xScale.invert(x)
  const [start, end] = xScale.domain()
  const dateLabel = formatDateInRange(d, start, end)

  return (
    <Row className="items-center gap-2">
      {prev.obj?.userAvatarUrl && prev.obj?.userId && (
        <UserHovercard userId={prev.obj.userId}>
          <Avatar size="xs" avatarUrl={prev.obj.userAvatarUrl} />
        </UserHovercard>
      )}
      <span className="font-semibold">{next ? dateLabel : 'Now'}</span>
      <span className="text-ink-600">{formatY(prev.y)}</span>
    </Row>
  )
}

export const MultiBinaryChartTooltip = (props: {
  ttProps: TooltipProps<SingleContractPoint>
  xScale: any
  topColor: string
  topLabel: string
  bottomColor: string
  bottomLabel: string
}) => {
  const { ttProps, xScale, topColor, bottomColor } = props
  const { prev, next, x } = ttProps
  if (!prev) return null

  const d = xScale.invert(x)
  const [start, end] = xScale.domain()
  const dateLabel = formatDateInRange(d, start, end)

  return (
    <div>
      <div>{next ? dateLabel : 'Now'}</div>
      <div
        className="flex items-center gap-1 text-base font-semibold"
        style={{ color: topColor }}
      >
        {formatPct(1 - prev.y)}
      </div>
      <div
        className="flex items-center gap-1 text-base font-semibold"
        style={{ color: bottomColor }}
      >
        {formatPct(prev.y)}
      </div>
    </div>
  )
}
