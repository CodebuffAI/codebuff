import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { Avatar } from './widgets/avatar'
import { FollowButton } from './buttons/follow-button'
import { Col } from './layout/col'
import { Row } from './layout/row'
import { UserLink } from 'web/components/widgets/user-link'
import { LoadingIndicator } from './widgets/loading-indicator'
import { UserHovercard } from './user/user-hovercard'
import { useDisplayUserById } from 'web/hooks/use-user-supabase'

export function FollowList(props: { userIds?: string[] }) {
  const { userIds } = props
  const currentUser = useUser()

  if (userIds == null) {
    return <LoadingIndicator className="py-4" />
  }

  return (
    <Col className="gap-2 overflow-auto p-6 pt-4">
      {userIds.length === 0 && (
        <div className="text-ink-500">No users yet...</div>
      )}
      {userIds.map((userId) => (
        <UserFollowItem
          key={userId}
          userId={userId}
          hideFollowButton={userId === currentUser?.id}
        />
      ))}
    </Col>
  )
}

function UserFollowItem(props: {
  userId: string
  hideFollowButton?: boolean
  className?: string
}) {
  const { userId, hideFollowButton, className } = props
  const user = useDisplayUserById(userId)

  return (
    <Row className={clsx('items-center justify-between gap-2 p-2', className)}>
      <UserHovercard userId={userId}>
        <Row className="items-center gap-2">
          <Avatar username={user?.username} avatarUrl={user?.avatarUrl} />
          {user && <UserLink user={user} />}
        </Row>
      </UserHovercard>
      {!hideFollowButton && <FollowButton userId={userId} />}
    </Row>
  )
}
