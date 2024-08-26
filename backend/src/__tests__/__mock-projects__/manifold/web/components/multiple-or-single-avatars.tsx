import { Avatar, AvatarSizeType } from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from './layout/row'
import clsx from 'clsx'
import { UserHovercard } from './user/user-hovercard'

export const MultipleOrSingleAvatars = (props: {
  avatars: Array<{ avatarUrl: string; id: string }>
  onClick?: () => void
  size: AvatarSizeType
  // TODO: standardize these numbers so they are calculated from the size
  spacing?: number
  startLeft?: number
  className?: string
}) => {
  const { avatars, className, onClick, size } = props
  const combineAvatars = (
    avatars: Array<{ avatarUrl: string; id: string }>
  ) => {
    const totalAvatars = avatars.length
    const maxToShow = Math.min(totalAvatars, 3)
    const avatarsToCombine = avatars.slice(
      totalAvatars - maxToShow,
      totalAvatars
    )
    const max = avatarsToCombine.length
    const startLeft = (props.startLeft ?? 0.1) * (max - 1)
    const spacing = props.spacing ?? 0.3
    return avatarsToCombine.map((n, index) => (
      <div
        key={index}
        style={
          index > 0
            ? {
                marginLeft: `${-startLeft + index * spacing}rem`,
              }
            : {}
        }
      >
        <UserHovercard userId={n.id}>
          <Avatar size={size} avatarUrl={n.avatarUrl} />
        </UserHovercard>
      </div>
    ))
  }
  return (
    <Col
      onClick={onClick}
      className={clsx(`relative cursor-pointer items-center`, className)}
    >
      {avatars.length === 1 ? (
        <UserHovercard userId={avatars[0].id}>
          <Avatar size={size} avatarUrl={avatars[0].avatarUrl} />
        </UserHovercard>
      ) : (
        <Row>{combineAvatars(avatars)}</Row>
      )}
    </Col>
  )
}
