import { User } from 'web/lib/firebase/users'
import { SEO } from 'web/components/SEO'
import { Page } from 'web/components/layout/page'
import { Avatar } from 'web/components/widgets/avatar'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { FollowButton } from 'web/components/buttons/follow-button'
import { BannedBadge, UserBadge } from 'web/components/widgets/user-link'
import { MoreOptionsUserButton } from 'web/components/buttons/more-options-user-button'
import { PrivateUser } from 'common/user'
import { UserHovercard } from '../user/user-hovercard'

export function BlockedUser(props: { user: User; privateUser: PrivateUser }) {
  const { user } = props

  return (
    <Page trackPageView={'blocked user page'} key={user.id}>
      <SEO
        title={`${user.name} (@${user.username})`}
        description={user.bio ?? ''}
        url={`/${user.username}`}
      />

      <Col className="relative">
        <Row className="relative px-4 pt-4">
          <UserHovercard userId={user.id}>
            <Avatar
              username={user.username}
              avatarUrl={user.avatarUrl}
              size={'xl'}
              className="bg-canvas-0 shadow-primary-300 shadow-sm"
            />
          </UserHovercard>

          <Col className="w-full gap-4 pl-5">
            <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between">
              <Col>
                <span className="break-anywhere text-lg font-bold sm:text-2xl">
                  {user.name}
                  {' (Blocked) '}
                  {<UserBadge userId={user.id} username={user.username} />}
                  {user.isBannedFromPosting && <BannedBadge />}
                </span>
                <Row className="sm:text-md items-center gap-x-3 text-sm ">
                  <span className={' text-ink-400'}>@{user.username}</span>
                </Row>
              </Col>
              <Row
                className={
                  'h-full w-full items-center justify-between sm:w-auto sm:justify-end sm:gap-4'
                }
              >
                <FollowButton userId={user.id} />
                <MoreOptionsUserButton user={user} />
              </Row>
            </div>
          </Col>
        </Row>
      </Col>
    </Page>
  )
}
