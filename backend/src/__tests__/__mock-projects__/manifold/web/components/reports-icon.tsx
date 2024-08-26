'use client'
import { FlagIcon } from '@heroicons/react/outline'
import { Row } from 'web/components/layout/row'
import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { ModReport } from 'common/mod-report'

export function ReportsIcon(props: { className?: string }) {
  const { className } = props
  const [newReportsCount, setNewReportsCount] = useState(0)

  const fetchNewReportsCount = async () => {
    const response = await api('get-mod-reports', {})
    if (response.status === 'success') {
      const newReports = response.reports.filter(
        (report: ModReport) => report.status === 'new'
      )
      setNewReportsCount(newReports.length)
    } else {
      console.error('Failed to fetch reports:', response)
    }
  }

  useEffect(() => {
    fetchNewReportsCount()
  }, [])

  return (
    <Row className="relative justify-center">
      <FlagIcon className={className} />
      {newReportsCount > 0 && (
        <div className="-mt-0.75 text-ink-0 bg-primary-500 absolute ml-3.5 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3 lg:left-0 lg:-mt-1 lg:ml-2">
          {newReportsCount}
        </div>
      )}
    </Row>
  )
}
