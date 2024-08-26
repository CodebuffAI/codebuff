import { User } from 'common/user'
import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Row } from 'web/components/layout/row'
import { firebaseLogin } from 'web/lib/firebase/users'
import { track } from 'web/lib/service/analytics'
import { unfollowTopic } from 'web/lib/supabase/groups'
import { Button, SizeType } from '../buttons/button'
import { followTopic } from 'web/lib/api/api'
import { Group, LiteGroup } from 'common/group'
import { BookmarkIcon } from '@heroicons/react/outline'
import { TOPIC_IDS_YOU_CANT_FOLLOW } from 'common/supabase/groups'

export function FollowOrUnfolowTopicButton(props: {
  group: LiteGroup
  isMember: boolean | undefined
  user: User | undefined | null
  size?: SizeType
  label?: string
}) {
  const { group, size, user, label } = props

  // Handle both non-live and live updating isMember state
  const [isMember, setIsMember] = useState(props.isMember)
  useEffect(() => {
    setIsMember(props.isMember)
  }, [props.isMember])

  const unfollow = user
    ? () => {
        track('leave group', { slug: group.slug })
        unfollowTopic(group.id, user.id)
          .then(() => setIsMember(false))
          .catch((e) => {
            console.error(e)
            toast.error('Failed to unfollow category')
          })
      }
    : firebaseLogin
  const follow = user
    ? () => {
        track('join group', { slug: group.slug })
        followTopic({ groupId: group.id })
          .then(() => setIsMember(true))
          .catch((e) => {
            console.error(e)
            toast.error('Failed to follow category')
          })
      }
    : firebaseLogin

  if (isMember) {
    return (
      <Button
        size={size ?? 'xs'}
        color="gray-outline"
        className={'group'}
        onClick={(e) => {
          e.preventDefault()
          unfollow()
        }}
      >
        <Row className="gap-1">
          <BookmarkIcon className={'group-hover:fill-ink-500 h-5 w-5'} />
          Unfollow{label ? ` ${label}` : ''}
        </Row>
      </Button>
    )
  }
  if (TOPIC_IDS_YOU_CANT_FOLLOW.includes(group.id)) return null
  return (
    <Button
      size={size ?? 'xs'}
      color="indigo"
      className={'group'}
      onClick={(e) => {
        e.preventDefault()
        follow()
      }}
    >
      <Row className="gap-1">
        <BookmarkIcon
          className={'h-5 w-5 transition-colors group-hover:fill-white'}
        />
        Follow{label ? ` ${label}` : ''}
      </Row>
    </Button>
  )
}

export const internalFollowTopic = async (
  user: User | null | undefined,
  group: Group
) => {
  if (!user) return firebaseLogin()
  await followTopic({ groupId: group.id })
    .then(() => {
      toast(`You'll see markets related to ${group.name} on your home feed!`)
    })
    .catch((e) => {
      console.error(e)
      toast.error('Failed to follow topic')
    })
  track('join group', { slug: group.slug })
}

export const internalUnfollowTopic = async (
  user: User | null | undefined,
  group: Group
) => {
  if (!user) return firebaseLogin()
  await unfollowTopic(group.id, user.id)
    .then(() => {
      toast(`You won't see markets related to ${group.name} on your home feed.`)
    })
    .catch(() => {
      toast.error('Failed to unfollow topic')
    })
  track('leave group', { slug: group.slug })
}
