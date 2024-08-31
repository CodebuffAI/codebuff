import { Placement } from '@floating-ui/react'
import { ReactNode } from 'react'
import { formatTime } from 'web/lib/util/time'
import { Tooltip } from './tooltip'

export function DateTimeTooltip(props: {
  time: number
  text?: string
  className?: string
  children: ReactNode
  noTap?: boolean
  noFade?: boolean
  placement?: Placement
}) {
  const { time, text, ...rest } = props

  const formattedTime = formatTime(time)
  const toolTip = text ? `${text} ${formattedTime}` : formattedTime

  return <Tooltip text={toolTip} {...rest} suppressHydrationWarning />
}
