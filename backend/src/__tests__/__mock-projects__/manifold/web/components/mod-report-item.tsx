import React from 'react'
import { UserHovercard } from 'web/components/user/user-hovercard'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { RelativeTimestamp } from 'web/components/relative-timestamp'
import { ChoicesToggleGroup } from 'web/components/widgets/choices-toggle-group'
import { EditableModNote } from 'web/components/contract/editable-mod-note'
import { BannedBadge } from 'web/components/widgets/user-link'
import Link from 'next/link'
import { ModReport, ReportStatus } from 'common/mod-report'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { parseJsonContentToText } from 'common/util/parse'

interface ReportItemProps {
  report: ModReport
  reportStatuses: { [key: number]: ReportStatus }
  modNotes: { [key: number]: string | undefined }
  handleStatusChange: (
    reportId: number,
    newStatus: ReportStatus
  ) => Promise<void>
  handleNoteSave: (reportId: number, newNote: string) => Promise<void>
}

const ModReportItem: React.FC<ReportItemProps> = ({
  report,
  reportStatuses,
  modNotes,
  handleStatusChange,
  handleNoteSave,
}) => {
  const parsedContent = parseJsonContentToText(report.comment_content)

  const owner = {
    id: report.user_id,
    name: report.owner_name,
    username: report.owner_username,
  }

  return (
    <Row key={report.report_id} className="p-4">
      <Col className="w-full gap-1">
        <Row className="flex w-full items-center justify-between">
          <div className="flex items-center">
            <UserHovercard userId={report.user_id}>
              <div className="flex items-center">
                <Avatar
                  username={report.owner_username}
                  avatarUrl={report.owner_avatar_url || ''}
                  size="sm"
                />
                <UserLink user={owner} className="text-ink-800 ml-2" />
                {report.owner_is_banned_from_posting && <BannedBadge />}
              </div>
            </UserHovercard>
            <Row className="ml-2">commented:</Row>
          </div>
          {report.created_time && (
            <RelativeTimestamp
              time={new Date(report.created_time!).getTime()}
              className="ml-4"
            />
          )}
        </Row>
        <Row className="ml-10">
          <Link
            className="text-primary-700 hover:text-primary-500 hover:underline"
            href={`/${report.creator_username}/${report.contract_slug}#${report.comment_id}`}
          >
            {parsedContent || 'Invalid comment content'}
          </Link>
        </Row>
        <Row className="mt-2">Market: {report.contract_question}</Row>

        <Row className="mt-1 items-center">
          <div className="pr-2"> Status: </div>
          <ChoicesToggleGroup
            currentChoice={reportStatuses[report.report_id] || 'new'}
            choicesMap={{
              New: 'new',
              'Under Review': 'under review',
              Resolved: 'resolved',
              'Needs Admin': 'needs admin',
            }}
            setChoice={(val) =>
              handleStatusChange(report.report_id, val as ReportStatus)
            }
          />
        </Row>
        <Row className="mt-2 items-center">
          Mod note:&nbsp;
          <EditableModNote
            reportId={report.report_id}
            initialNote={modNotes[report.report_id] || ''}
            onSave={handleNoteSave}
          />
        </Row>
      </Col>
    </Row>
  )
}

export default ModReportItem
