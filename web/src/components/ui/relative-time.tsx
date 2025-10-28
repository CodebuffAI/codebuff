'use client'

import { useState, useEffect } from 'react'
import { formatRelativeTime } from '@/lib/date-utils'

interface RelativeTimeProps {
  date: string
}

export function RelativeTime({ date }: RelativeTimeProps) {
  const [isClient, setIsClient] = useState(false)
  const [relativeTime, setRelativeTime] = useState('')

  useEffect(() => {
    setIsClient(true)
    setRelativeTime(formatRelativeTime(date))

    // Update every minute to keep relative time fresh
    const interval = setInterval(() => {
      setRelativeTime(formatRelativeTime(date))
    }, 60000)

    return () => clearInterval(interval)
  }, [date])

  // Show absolute date on server, relative time on client
  if (!isClient) {
    return <>{new Date(date).toLocaleDateString()}</>
  }

  return <>{relativeTime}</>
}
