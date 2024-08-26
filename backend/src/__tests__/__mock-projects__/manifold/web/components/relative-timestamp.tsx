import { DateTimeTooltip } from './widgets/datetime-tooltip'
import { fromNow } from 'web/lib/util/time'
import { useIsClient } from 'web/hooks/use-is-client'
import { Placement } from '@floating-ui/react'

export function RelativeTimestamp(props: {
  time: number
  className?: string
  placement?: Placement
  shortened?: boolean
}) {
  const { time, className, placement, shortened } = props
  const isClient = useIsClient()
  return (
    <DateTimeTooltip
      className="text-ink-400 ml-1 whitespace-nowrap"
      time={time}
      placement={placement}
    >
      <span className={className}>
        {isClient ? shortened ? shortenedFromNow(time) : fromNow(time) : <></>}
      </span>
    </DateTimeTooltip>
  )
}

export function RelativeTimestampNoTooltip(props: {
  time: number
  className?: string
  shortened?: boolean
}) {
  const { time, className, shortened } = props
  const isClient = useIsClient()
  return (
    <span className={className}>
      {isClient && (shortened ? shortenedFromNow(time) : fromNow(time))}
    </span>
  )
}

import dayjs from 'dayjs'
import relativeTime from 'dayjs/plugin/relativeTime'
import { shortenedFromNow } from 'web/lib/util/shortenedFromNow'

dayjs.extend(relativeTime)
