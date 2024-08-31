import { useCallback } from 'react'
import { ContractComment } from 'common/comment'
import { User } from 'common/user'
import { groupConsecutive } from 'common/util/array'
import { UserLink } from 'web/components/widgets/user-link'
import { Col } from '../layout/col'
import { RelativeTimestamp } from '../relative-timestamp'
import { Avatar } from '../widgets/avatar'
import { Content } from '../widgets/editor'
import { PaginationNextPrev } from '../widgets/pagination'
import Link from 'next/link'
import { usePagination } from 'web/hooks/use-pagination'
import { api } from 'web/lib/api/api'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { getCommentLink } from 'web/components/feed/copy-link-date-time'
import clsx from 'clsx'
import { linkClass } from 'web/components/widgets/site-link'
import { UserHovercard } from '../user/user-hovercard'

type ContractKey = {
  contractId: string
  contractSlug: string
  contractQuestion: string
}

function contractPath(slug: string) {
  // by convention this includes the contract creator username, but we don't
  // have that handy, so we just put /market/
  return `/market/${slug}`
}

export function UserCommentsList(props: { user: User }) {
  const { user } = props

  const q = useCallback(
    async (p: { limit: number; offset: number }) => {
      const page = p.offset / p.limit
      return await api('comments', {
        userId: user.id,
        limit: p.limit,
        page,
      })
    },
    [user.id]
  )
  const pagination = usePagination({ pageSize: 50, q })

  const items = groupConsecutive(pagination.items, (c) => {
    return {
      contractId: c.contractId,
      contractQuestion: c.contractQuestion,
      contractSlug: c.contractSlug,
    }
  })

  if (items.length === 0) {
    if (pagination.isComplete) {
      return <p className="text-ink-500 mt-4">No comments yet</p>
    } else {
      return <LoadingIndicator className="mt-4" />
    }
  }

  return (
    <Col className={'bg-canvas-50'}>
      {items.map(({ key, items }, i) => {
        return <ProfileCommentGroup key={i} groupKey={key} items={items} />
      })}
      <PaginationNextPrev
        className="border-ink-200 border-t px-4 py-3 sm:px-6"
        {...pagination}
      />
    </Col>
  )
}

function ProfileCommentGroup(props: {
  groupKey: ContractKey
  items: ContractComment[]
}) {
  const { groupKey, items } = props
  const { contractSlug, contractQuestion } = groupKey
  const path = contractPath(contractSlug)
  return (
    <div className="bg-canvas-0 border-ink-300 border-b p-2">
      <Link
        className={clsx(
          'text-primary-700 mb-2 block py-1 pl-2 font-medium',
          linkClass
        )}
        href={path}
      >
        {contractQuestion}
      </Link>
      <Col className="gap-6">
        {items.map((c) => (
          <ProfileComment key={c.id} comment={c} contractSlug={contractSlug} />
        ))}
      </Col>
    </div>
  )
}

function ProfileComment(props: {
  comment: ContractComment
  contractSlug: string
}) {
  const { comment, contractSlug } = props
  const {
    text,
    content,
    userId,
    userUsername,
    userName,
    userAvatarUrl,
    createdTime,
    id,
  } = comment

  return (
    <Link
      href={getCommentLink('market', contractSlug, id)}
      className={
        'hover:bg-canvas-100 relative flex flex-row items-start space-x-3 rounded-lg p-2'
      }
    >
      <UserHovercard userId={userId}>
        <Avatar
          noLink={true}
          username={userUsername}
          avatarUrl={userAvatarUrl}
        />
      </UserHovercard>
      <div className="min-w-0 flex-1">
        <div className="text-ink-500 mt-0.5 text-sm">
          <UserHovercard userId={userId}>
            <UserLink
              className="text-ink-500"
              user={{
                id: userId,
                name: userName,
                username: userUsername,
              }}
              noLink={true}
            />
          </UserHovercard>{' '}
          <RelativeTimestamp time={createdTime} />
        </div>
        <Content content={content || text} size="sm" />
      </div>
    </Link>
  )
}
