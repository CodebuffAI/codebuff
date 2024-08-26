import { Dashboard } from 'common/dashboard'
import { Col } from '../layout/col'
import { Row } from '../layout/row'
import { Avatar } from '../widgets/avatar'
import { FollowDashboardButton } from './follow-dashboard-button'
import { LoadingIndicator } from '../widgets/loading-indicator'
import { LoadMoreUntilNotVisible } from '../widgets/visibility-observer'
import { ClickFrame } from '../widgets/click-frame'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { UserHovercard } from '../user/user-hovercard'

export function DashboardCards(props: {
  dashboards?: Dashboard[]
  loadMore?: () => Promise<boolean>
}) {
  const { dashboards, loadMore } = props

  if (!dashboards) {
    return <LoadingIndicator />
  }
  if (dashboards.length === 0) return null

  return (
    <>
      <Col className="gap-2">
        {dashboards.map((dashboard: Dashboard) => (
          <DashboardCard key={dashboard.id} dashboard={dashboard} />
        ))}
      </Col>
      {loadMore && <LoadMoreUntilNotVisible loadMore={loadMore} />}
    </>
  )
}

function DashboardCard(props: { dashboard: Dashboard }) {
  const { id, title, slug, creatorId, creatorAvatarUrl, creatorUsername } =
    props.dashboard
  const router = useRouter()

  const href = `/news/${slug}`

  return (
    <ClickFrame
      onClick={() => router.push(href)}
      className="bg-canvas-0 border-canvas-0 hover:border-primary-300 flex cursor-pointer flex-col gap-2 rounded-lg border py-2 pl-4 pr-2 transition-colors"
    >
      <Row className="w-full items-center justify-between">
        <Link
          className={'flex items-center gap-2 truncate text-sm'}
          href={href}
        >
          <UserHovercard userId={creatorId}>
            <Avatar
              size={'xs'}
              className={'mr-0.5'}
              avatarUrl={creatorAvatarUrl}
              username={creatorUsername}
              noLink
            />
          </UserHovercard>
          <div className="truncate text-base sm:text-lg">{title}</div>
        </Link>
        <FollowDashboardButton
          dashboardId={id}
          dashboardCreatorId={creatorId}
          ttPlacement="left"
        />
      </Row>
    </ClickFrame>
  )
}
