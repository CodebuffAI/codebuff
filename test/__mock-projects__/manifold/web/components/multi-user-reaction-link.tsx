import { Col } from 'web/components/layout/col'
import { Modal } from 'web/components/layout/modal'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { Notification } from 'common/notification'
import { NotificationUserLink } from './notifications/notification-helpers'
import { UserHovercard } from './user/user-hovercard'

export function MultiUserReactionModal(props: {
  similarNotifications: Notification[]
  modalLabel: string
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { similarNotifications, modalLabel, open, setOpen } = props
  return (
    <Modal open={open} setOpen={setOpen} size={'sm'}>
      <Col className="bg-canvas-0 items-start gap-4 rounded-md p-6">
        <span className={'text-xl'}>{modalLabel}</span>
        {similarNotifications.map((notif) => (
          <Row
            key={notif.sourceUserUsername + 'list'}
            className="w-full items-center gap-2"
          >
            <UserHovercard userId={notif.userId}>
              <Avatar
                username={notif.sourceUserUsername}
                avatarUrl={notif.sourceUserAvatarUrl}
              />
            </UserHovercard>
            <NotificationUserLink
              name={notif.sourceUserName}
              username={notif.sourceUserUsername}
            />
          </Row>
        ))}
      </Col>
    </Modal>
  )
}
