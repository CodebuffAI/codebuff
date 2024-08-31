import clsx from 'clsx'
import { useEffect, useState } from 'react'
import { getCountdownString } from 'web/lib/util/time'

export function Countdown(props: { endDate: Date; className?: string }) {
  const { endDate, className } = props

  const [countdown, setCountdown] = useState('')
  useEffect(() => {
    setCountdown(getCountdownString(endDate))

    const intervalId = setInterval(() => {
      setCountdown(getCountdownString(endDate))
    }, 1000)
    return () => clearInterval(intervalId)
  }, [endDate])

  return <span className={clsx(className)}>{countdown}</span>
}
