import { useUser } from 'web/hooks/use-user'
import { Button } from 'web/components/buttons/button'
import { withTracking } from 'web/lib/service/analytics'
import { toast } from 'react-hot-toast'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Title } from 'web/components/widgets/title'
import { capitalize } from 'lodash'
import { ReportProps } from 'common/report'
import { report as reportContent } from 'web/lib/api/api'

export function ReportButton(props: { report: ReportProps }) {
  const { report } = props
  const { contentOwnerId, contentType } = report
  const currentUser = useUser()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const label = contentType === 'contract' ? 'question' : contentType
  if (!currentUser || currentUser.id === contentOwnerId) return null

  return (
    <>
      <Button
        size={'xs'}
        color={'yellow-outline'}
        onClick={() => {
          setIsModalOpen(true)
        }}
      >
        Report
      </Button>
      <ReportModal
        isModalOpen={isModalOpen}
        label={label}
        setIsModalOpen={setIsModalOpen}
        report={report}
      />
    </>
  )
}

export const ReportModal = (props: {
  isModalOpen: boolean
  setIsModalOpen: (isModalOpen: boolean) => void
  label: string
  report: ReportProps
}) => {
  const { label, report, setIsModalOpen, isModalOpen } = props

  const [isReported, setIsReported] = useState(false)

  const onReport = async () => {
    await toast.promise(reportContent(report), {
      loading: 'Reporting...',
      success: `${capitalize(
        label
      )} reported! Admins will take a look within 24 hours.`,
      error: `Error reporting ${label}`,
    })
    setIsReported(true)
  }

  return (
    <Modal open={isModalOpen} setOpen={setIsModalOpen}>
      <Col className={'bg-canvas-0 rounded-md p-4'}>
        <Title>Report {label}</Title>
        <span className={'mb-4 text-sm'}>
          {isReported
            ? `You've reported this ${label}. Our team will take a look within 24 hours.`
            : `Report this ${label} for objectionable content that violates our `}
          <a
            href="https://manifoldmarkets.notion.site/Community-Guidelines-2b986d33f0c646478d4921667c272f21?pvs=4"
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary-600 hover:text-primary-800 hover:underline"
          >
            guidelines
          </a>
          .
        </span>
        <Row className={'items-center justify-between'}>
          <Button color={'gray-white'} onClick={() => setIsModalOpen(false)}>
            {isReported ? 'Done' : 'Cancel'}
          </Button>
          {!isReported && (
            <Button
              size="sm"
              color="red"
              className="my-auto"
              onClick={withTracking(onReport, 'block')}
            >
              Report {label}
            </Button>
          )}
        </Row>
      </Col>
    </Modal>
  )
}
