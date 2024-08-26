import clsx from 'clsx'
import { Period, periodDurations } from 'common/period'
import { ChoicesToggleGroup, ColorType } from '../widgets/choices-toggle-group'

const labels: { [label: string]: Period } = {
  '1D': 'daily',
  '1W': 'weekly',
  '1M': 'monthly',
  ALL: 'allTime',
}

export const TimeRangePicker = (props: {
  currentTimePeriod: Period | 'custom'
  setCurrentTimePeriod: (period: Period) => void
  /** milliseconds */
  maxRange?: number
  color?: ColorType
  disabled?: boolean
  className?: string
  toggleClassName?: string
}) => {
  const {
    currentTimePeriod,
    setCurrentTimePeriod,
    maxRange,
    color,
    disabled,
    className,
    toggleClassName,
  } = props

  const disabledOptions = !maxRange
    ? undefined
    : Object.values(labels).filter(
        (period) => period !== 'allTime' && periodDurations[period] > maxRange
      )

  return (
    <ChoicesToggleGroup
      currentChoice={currentTimePeriod}
      choicesMap={labels}
      setChoice={setCurrentTimePeriod as any}
      disabled={disabled}
      disabledOptions={disabledOptions}
      color={color}
      className={clsx('!shadow-none', className)}
      toggleClassName={clsx('py-1 !px-1', toggleClassName)}
    />
  )
}
