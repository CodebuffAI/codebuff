import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { SEO } from 'web/components/SEO'
import { useAdminOrMod } from 'web/hooks/use-admin'
import { ModReport, ReportStatus } from 'common/mod-report'
import Link from 'next/link'
import { useModReports } from 'web/hooks/use-mod-reports'
import ModReportItem from 'web/components/mod-report-item'
import { Title } from 'web/components/widgets/title'
import { api } from 'web/lib/api/api'

const updateModReport = async (
  reportId: number,
  updates: Partial<{ status: ReportStatus; mod_note: string }>
) => {
  const response = await api('update-mod-report', { reportId, updates })
  if (response.status === 'success') {
    return response.report
  } else {
    console.error('Error updating report:', response)
    return null
  }
}

export default function ReportsPage() {
  const isAdminOrMod = useAdminOrMod()
  const {
    reports: modReports,
    initialLoading,
    reportStatuses,
    modNotes,
    setReportStatuses,
    setModNotes,
  } = useModReports()

  const handleStatusChange = async (
    reportId: number,
    newStatus: ReportStatus
  ) => {
    setReportStatuses((prevStatuses) => ({
      ...prevStatuses,
      [reportId]: newStatus,
    }))

    await updateModReport(reportId, { status: newStatus })
  }

  const handleNoteSave = async (reportId: number, newNote: string) => {
    setModNotes((prevNotes) => ({
      ...prevNotes,
      [reportId]: newNote,
    }))

    await updateModReport(reportId, { mod_note: newNote })
  }

  if (!isAdminOrMod)
    return (
      <Page trackPageView={'mod reports'}>
        <div className="mt-24 self-center">
          You must be a Mod or Admin to view this page.
        </div>
      </Page>
    )

  if (initialLoading)
    return (
      <Page trackPageView={'mod reports'}>
        <div className="mt-24 self-center">Loading reports...</div>
      </Page>
    )

  const unresolvedReports = (modReports ?? []).filter(
    (report) =>
      report.status === 'new' ||
      report.status === 'under review' ||
      report.status === 'needs admin'
  )

  const resolvedReports = (modReports ?? []).filter(
    (report) => report.status === 'resolved'
  )

  const renderReportList = (reportList: ModReport[]) => (
    <Col className="w-full">
      {reportList.map((report: ModReport) => (
        <ModReportItem
          key={report.report_id}
          report={report}
          reportStatuses={reportStatuses}
          modNotes={modNotes}
          handleStatusChange={handleStatusChange}
          handleNoteSave={handleNoteSave}
        />
      ))}
    </Col>
  )

  const tabs = [
    {
      title: 'Unresolved',
      content:
        unresolvedReports.length > 0 ? (
          renderReportList(unresolvedReports)
        ) : (
          <Col className="mt-8 text-center">
            All reports have been resolved, great job! Keep it up and one day
            you'll get a raise 🤑
            <Link
              href="/admin/reports"
              className="text-primary-700 hover:text-primary-500 mt-3 text-center hover:underline"
            >
              Other reports...
            </Link>
          </Col>
        ),
      queryString: 'unresolved',
    },
    {
      title: 'Resolved',
      content: renderReportList(resolvedReports),
      queryString: 'resolved',
    },
  ]

  return (
    <Page trackPageView={'mod reports'}>
      <SEO
        title="Mod Reports"
        description="A page for mods to review reports and support tickets from users."
        url="/reports"
      />
      <Col className="p-4">
        <Title>Reports</Title>
        <QueryUncontrolledTabs
          tabs={tabs}
          defaultIndex={0}
          scrollToTop={true}
          trackingName="mod-reports-tabs"
        />
      </Col>
    </Page>
  )
}
