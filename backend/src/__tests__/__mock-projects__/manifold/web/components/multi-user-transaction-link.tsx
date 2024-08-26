import { ReactNode, useState } from 'react'
import { formatMoney } from 'common/util/format'
import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { UserHovercard } from './user/user-hovercard'

export type MultiUserLinkInfo = {
  id: string
  name: string
  username: string
  avatarUrl: string | undefined
  amount?: number
}

export function MultiUserTransactionLink(props: {
  userInfos: MultiUserLinkInfo[]
  modalLabel: string
  text: string
}) {
  const { userInfos, modalLabel, text } = props
  const [open, setOpen] = useState(false)
  return (
    <span>
      <button
        className={
          'hover:text-primary-500 bg-transparent font-semibold transition-colors'
        }
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
      >
        {text}
      </button>
      <MultiUserTransactionModal
        userInfos={userInfos}
        modalLabel={modalLabel}
        open={open}
        setOpen={setOpen}
      />
    </span>
  )
}

export function MultiUserTransactionModal(props: {
  userInfos: MultiUserLinkInfo[] | null
  modalLabel: string | ReactNode
  open: boolean
  setOpen: (open: boolean) => void
  short?: boolean
}) {
  const { userInfos, modalLabel, open, setOpen, short } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'sm'}>
      <Col className="bg-canvas-0 text-ink-1000 relative items-start gap-4 rounded-md p-6">
        <span className={'sticky top-0'}>{modalLabel}</span>
        {userInfos == null ? (
          <LoadingIndicator />
        ) : userInfos.length > 0 ? (
          <Col className="max-h-96 w-full gap-4 overflow-y-auto">
            {userInfos.map((userInfo) => (
              <UserHovercard
                userId={userInfo.id}
                key={userInfo.username + 'list'}
              >
                <Row className="w-full items-center gap-2">
                  {userInfo.amount && (
                    <span className="min-w-[3.5rem] text-teal-500">
                      +{formatMoney(userInfo.amount)}
                    </span>
                  )}
                  <Avatar
                    username={userInfo.username}
                    avatarUrl={userInfo.avatarUrl}
                    size={'sm'}
                  />
                  <UserLink user={userInfo} short={short} />
                </Row>
              </UserHovercard>
            ))}
          </Col>
        ) : (
          <div>No one yet...</div>
        )}
      </Col>
    </Modal>
  )
}
