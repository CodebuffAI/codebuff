import { CPMMNumericContract } from 'common/contract'
import { firebaseLogin, User } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { Button } from 'web/components/buttons/button'
import { useState } from 'react'
import { Modal } from 'web/components/layout/modal'
import { NumericBetPanel } from 'web/components/answers/numeric-bet-panel'
import { Row } from 'web/components/layout/row'
import { Col } from 'web/components/layout/col'

export function NumericBetButton(props: {
  contract: CPMMNumericContract
  user: User | null | undefined
}) {
  const { contract, user } = props
  const [open, setOpen] = useState(false)
  const [direction, setDirection] = useState<'more than' | 'less than'>()

  return (
    <Row className=" gap-2">
      <Button
        size="xs"
        color={'red-outline'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'feeed card' })
          if (!user) {
            firebaseLogin()
            return
          }
          setDirection('less than')
          setOpen(true)
        }}
      >
        Lower
      </Button>
      <Button
        size="xs"
        color={'green-outline'}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          // TODO: Twomba tracking bet terminology
          track('bet intent', { location: 'feeed card' })
          if (!user) {
            firebaseLogin()
            return
          }
          setDirection('more than')
          setOpen(true)
        }}
      >
        Higher
      </Button>
      <Modal open={open} setOpen={setOpen} size="md">
        <Col className={'bg-canvas-0 p-3'}>
          <NumericBetPanel contract={contract} mode={direction} />
        </Col>
      </Modal>
    </Row>
  )
}
