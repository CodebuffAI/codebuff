import { ContractComment } from 'common/comment'
import { Contract, contractPath } from 'common/contract'
import { FeedCommentHeader } from '../comments/comment-header'
import { Col } from '../layout/col'
import clsx from 'clsx'
import { memo, useState } from 'react'
import { Row } from 'web/components/layout/row'
import { Avatar } from 'web/components/widgets/avatar'
import { FeedContractCard } from 'web/components/contract/feed-contract-card'
import { User } from 'common/user'
import { usePrivateUser } from 'web/hooks/use-user'
import router from 'next/router'
import { ClickFrame } from 'web/components/widgets/click-frame'
import { UserHovercard } from '../user/user-hovercard'
import { track } from 'web/lib/service/analytics'
import { removeUndefinedProps } from 'common/util/object'
import { Content } from 'web/components/widgets/editor'
import { useIsVisible } from 'web/hooks/use-is-visible'
import { BottomActionRow } from 'web/components/feed/scored-feed-repost-item'
const DEBUG_FEED_CARDS =
  typeof window != 'undefined' &&
  window.location.toString().includes('localhost:3000')
export const GoodComment = memo(function (props: {
  contract: Contract
  comment: ContractComment
  trackingLocation: string
  user: User | null | undefined
}) {
  const { contract, user, comment } = props
  const privateUser = usePrivateUser()
  const { userUsername, userAvatarUrl, userId } = comment
  const [hoveringChildContract, setHoveringChildContract] = useState(false)
  const { ref } = useIsVisible(
    () => {
      !DEBUG_FEED_CARDS &&
        track('view good comment', {
          contractId: contract.id,
          commentId: comment.id,
        })
    },
    true,
    true
  )
  const trackClick = () =>
    track(
      'click comment card feed',
      removeUndefinedProps({
        contractId: contract.id,
        creatorId: contract.creatorId,
        slug: contract.slug,
        commentId: comment.id,
      })
    )

  return (
    <Col
      className={clsx(
        'bg-canvas-0 ring- ring-primary-200 group rounded-lg py-2',
        hoveringChildContract ? '' : 'hover:ring-1'
      )}
      ref={ref}
    >
      <ClickFrame
        onClick={() => {
          trackClick()
          router.push(`${contractPath(contract)}#${comment.id}`)
        }}
      >
        <Row className={'w-full gap-2'}>
          <Col className={'w-full pl-1 pr-2  transition-colors'}>
            <Row className="justify-between gap-2">
              <Row className="gap-2">
                <UserHovercard userId={userId}>
                  <Avatar
                    username={userUsername}
                    size={'sm'}
                    avatarUrl={userAvatarUrl}
                  />
                </UserHovercard>
                <Col>
                  <FeedCommentHeader
                    comment={comment}
                    contract={contract}
                    inTimeline={true}
                  />
                  <Content size={'md'} content={comment.content} />
                </Col>
              </Row>
            </Row>
            <Col
              className={'ml-6 mt-2'}
              onMouseEnter={() => setHoveringChildContract(true)}
              onMouseLeave={() => setHoveringChildContract(false)}
            >
              <FeedContractCard
                contract={contract}
                trackingPostfix="feed"
                className="ring-ink-100 dark:ring-ink-300 hover:ring-primary-200 dark:hover:ring-primary-200 max-w-full pb-2 ring-1 "
                hideBottomRow={true}
                size={'xs'}
              />
            </Col>
            <Col>
              <BottomActionRow
                className={'ml-4'}
                contract={contract}
                user={user}
                comment={comment}
                privateUser={privateUser}
              />
            </Col>
          </Col>
        </Row>
      </ClickFrame>
    </Col>
  )
})
