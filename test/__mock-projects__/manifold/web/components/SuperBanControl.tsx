import { useState } from 'react'
import { Modal } from './layout/modal'
import { superBanUser } from 'web/lib/supabase/super-ban-user'
import { Col } from './layout/col'
import { Button } from './buttons/button'

const SuperBanControl = (props: { userId: string }) => {
  const { userId } = props
  const [showConfirmModal, setShowConfirmModal] = useState(false)
  const [showSummaryModal, setShowSummaryModal] = useState(false)
  const [summaryMessage, setSummaryMessage] = useState('')

  async function handleSuperBan() {
    setShowConfirmModal(false)
    try {
      const message = await superBanUser(userId)
      setSummaryMessage(message)
      setShowSummaryModal(true)
    } catch (error) {
      console.error('Superban failed:', error)
    }
  }

  return (
    <>
      <Button color="red" size="xs" onClick={() => setShowConfirmModal(true)}>
        Superban
      </Button>

      <Modal open={showConfirmModal} setOpen={setShowConfirmModal} size="md">
        <Col className={'bg-canvas-0 text-ink-1000 rounded-md p-4 '}>
          <div className="text-left">
            <p>
              Are you sure you want to superban this user? This will ban them,
              unlist and N/A all their markets, and hide all their comments.
            </p>
            <div className="mt-4 flex justify-around">
              <Button color="red" onClick={() => handleSuperBan()}>
                Yes, superban
              </Button>
              <Button color="gray" onClick={() => setShowConfirmModal(false)}>
                No, cancel
              </Button>
            </div>
          </div>
        </Col>
      </Modal>

      <Modal open={showSummaryModal} setOpen={setShowSummaryModal} size="md">
        <Col className={'bg-canvas-0 text-ink-1000 rounded-md p-4 '}>
          <div className="text-center">{summaryMessage}</div>
        </Col>
      </Modal>
    </>
  )
}

export default SuperBanControl
