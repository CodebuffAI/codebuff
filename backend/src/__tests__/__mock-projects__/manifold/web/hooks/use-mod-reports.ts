import { useEffect, useState } from 'react'
import { api } from 'web/lib/api/api'
import { ModReport, ReportStatus } from 'common/mod-report'
import { keyBy, mapValues } from 'lodash'

export const useModReports = () => {
  const [reports, setReports] = useState<ModReport[] | undefined>(undefined)
  const [reportStatuses, setReportStatuses] = useState<{
    [key: number]: ReportStatus
  }>({})
  const [modNotes, setModNotes] = useState<{
    [key: number]: string | undefined
  }>({})

  const getModReports = async () => {
    try {
      const response = await api('get-mod-reports', {})
      if (response && response.status === 'success') {
        const newReports = response.reports

        const sortedReports = newReports.sort(
          (a: ModReport, b: ModReport) =>
            new Date(b.created_time).getTime() -
            new Date(a.created_time).getTime()
        )

        setReports(sortedReports)

        const reportsById = keyBy(sortedReports, 'report_id')
        const initialStatuses = mapValues(reportsById, (r) => r.status)
        const initialNotes = mapValues(reportsById, (r) => r.mod_note)

        setReportStatuses(initialStatuses)
        setModNotes(initialNotes)
      } else {
        console.error('Failed to fetch reports:', response)
      }
    } catch (error) {
      console.error('Error fetching reports:', error)
    }
  }

  useEffect(() => {
    getModReports()

    const intervalId = setInterval(() => {
      getModReports()
    }, 1000)

    return () => clearInterval(intervalId)
  }, [])

  return {
    reports,
    initialLoading: reports === undefined,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  }
}
