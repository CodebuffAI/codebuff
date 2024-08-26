import { useIsFollowing } from 'web/hooks/use-follows'
import { isBlocked, usePrivateUser, useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { Button } from './button'
import clsx from 'clsx'

export function FollowButton(props: {
  userId: string
  size?: '2xs' | 'xs' | 'sm'
}) {
  const { userId, size = 'sm' } = props
  const user = useUser()
  const { isFollowing, toggleFollow } = useIsFollowing(user?.id, userId)
  const privateUser = usePrivateUser()
  if (!user || user.id === userId) return null
  if (isBlocked(privateUser, userId)) return <div />

  return (
    <Button
      size={size}
      color={isFollowing ? 'gray-outline' : 'indigo'}
      className={clsx(
        'my-auto',
        size === 'sm' && 'min-w-[84px]',
        size === 'xs' && 'min-w-[80px]',
        size === '2xs' && 'min-w-[68px]'
      )}
      onClick={(e) => {
        e.preventDefault()
        track(isFollowing ? 'unfollow' : 'follow')
        toggleFollow()
      }}
    >
      {isFollowing ? 'Following' : 'Follow'}
    </Button>
  )
}
