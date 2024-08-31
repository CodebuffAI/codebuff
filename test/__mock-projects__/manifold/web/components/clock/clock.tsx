import { useState, useEffect } from 'react'
import dayjs from 'dayjs'
import duration from 'dayjs/plugin/duration'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'
import { Display } from './display'
import clsx from 'clsx'
import { useIsClient } from 'web/hooks/use-is-client'

dayjs.extend(duration)

export const getTimeUntil = (year: number) => {
  const eventYear = Math.floor(year)
  const eventMonth = Math.round((year - eventYear) * 12)
  const eventDate = new Date(eventYear, eventMonth, 1)

  const currentTime = dayjs()
  const difference = dayjs(eventDate).diff(currentTime)

  const years = Math.floor(dayjs.duration(difference).asYears())
  const months = Math.floor(dayjs.duration(difference).asMonths()) % 12
  const days = Math.floor(dayjs.duration(difference).asDays()) % 30
  const hours = Math.floor(dayjs.duration(difference).asHours()) % 24
  const minutes = Math.floor(dayjs.duration(difference).asMinutes()) % 60
  const seconds = Math.floor(dayjs.duration(difference).asSeconds()) % 60

  return {
    years,
    months,
    days,
    hours,
    minutes,
    seconds,
  }
}

export const Clock = (props: { year: number }) => {
  const { year } = props
  const [timeUntil, setTimeUntil] = useState(getTimeUntil(year))
  const isClient = useIsClient()
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeUntil(getTimeUntil(year))
    }, 1000)

    return () => {
      clearInterval(timer)
    }
  }, [year])
  const dotClass = ' h-1 w-1 sm:h-1.5 sm:w-1.5 rounded-sm'
  const colon = (
    <Col className={'h-full justify-center  gap-2.5 sm:gap-4'}>
      <div style={{ backgroundColor: 'red' }} className={dotClass} />
      <div
        style={{ backgroundColor: 'red' }}
        className={clsx('mb-2 sm:mb-4', dotClass)}
      />
    </Col>
  )
  return (
    <Row className={'gap-1 text-xl sm:text-7xl'}>
      <Row
        style={{ color: 'red' }}
        className={
          'justify-center gap-1.5 rounded-lg bg-gray-900 p-4 ring-8 ring-gray-300 sm:gap-3 sm:pl-10 sm:pr-6'
        }
      >
        <TimeUnit value={timeUntil.years.toString()} unit={'years'} />
        {colon}
        <TimeUnit value={timeUntil.months.toString()} unit={'months'} />
        {colon}
        <TimeUnit value={timeUntil.days.toString()} unit={'days'} />
        {colon}
        <TimeUnit value={timeUntil.hours.toString()} unit={'hours'} />
        {colon}
        <TimeUnit unit={'minutes'} value={timeUntil.minutes.toString()} />
        {colon}
        {/* We want to show the -- for the changing seconds */}
        <TimeUnit
          unit={'seconds'}
          value={isClient ? timeUntil.seconds : null}
        />
      </Row>
    </Row>
  )
}
const TimeUnit = (props: { value: number | string | null; unit: string }) => {
  const { value, unit } = props
  return (
    <Col className={'items-center'}>
      <div className={'sm:hidden'}>
        <Display height={30} value={value} />
      </div>
      <div className={'hidden sm:block'}>
        <Display height={60} value={value} />
      </div>
      <span className={'text-xs font-bold sm:text-sm'}>{unit}</span>
    </Col>
  )
}
