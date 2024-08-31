import clsx from 'clsx'
import { Notification, ReactionNotificationTypes } from 'common/notification'
import { PrivateUser, User } from 'common/user'
import { groupBy, sortBy } from 'lodash'
import { useRouter } from 'next/router'
import { Fragment, ReactNode, useEffect, useMemo, useState } from 'react'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { Row } from 'web/components/layout/row'
import { QueryUncontrolledTabs } from 'web/components/layout/tabs'
import { NotificationSettings } from 'web/components/notification-settings'
import { combineAndSumIncomeNotifications } from 'web/components/notifications/income-summary-notifications'
import {
  combineReactionNotifications,
  NOTIFICATIONS_PER_PAGE,
  NUM_SUMMARY_LINES,
  ParentNotificationHeader,
  QuestionOrGroupLink,
} from 'web/components/notifications/notification-helpers'
import { api, markAllNotifications } from 'web/lib/api/api'
import { NotificationItem } from 'web/components/notifications/notification-types'
import { PushNotificationsModal } from 'web/components/push-notifications-modal'
import { SEO } from 'web/components/SEO'
import { ShowMoreLessButton } from 'web/components/widgets/collapsible-content'
import { Pagination } from 'web/components/widgets/pagination'
import { Title } from 'web/components/widgets/title'
import {
  NotificationGroup,
  useGroupedNotifications,
} from 'web/hooks/use-notifications'
import { useIsPageVisible } from 'web/hooks/use-page-visible'
import { useRedirectIfSignedOut } from 'web/hooks/use-redirect-if-signed-out'
import { usePrivateUser, useUser } from 'web/hooks/use-user'
import { XIcon } from '@heroicons/react/outline'
import { getNativePlatform } from 'web/lib/native/is-native'
import { AppBadgesOrGetAppButton } from 'web/components/buttons/app-badges-or-get-app-button'
import { LoadingIndicator } from 'web/components/widgets/loading-indicator'
import { track } from 'web/lib/service/analytics'

export default function NotificationsPage() {
  const privateUser = usePrivateUser()
  const user = useUser()
  useRedirectIfSignedOut()

  const [navigateToSection, setNavigateToSection] = useState<string>()
  const { isNative } = getNativePlatform()
  const router = useRouter()
  useEffect(() => {
    if (!router.isReady) return
    const query = { ...router.query }
    if (query.section) {
      setNavigateToSection(query.section as string)
    }
  }, [router.query])

  const shouldShowBanner =
    privateUser && !privateUser.hasSeenAppBannerInNotificationsOn && !isNative

  return (
    <Page trackPageView={'notifications page'}>
      <div className="w-full">
        <Title className="hidden lg:block">Notifications</Title>
        <SEO title="Notifications" description="Manifold user notifications" />
        {shouldShowBanner && <NotificationsAppBanner />}
        {privateUser && user && router.isReady ? (
          <NotificationsContent
            user={user}
            privateUser={privateUser}
            section={navigateToSection}
          />
        ) : null}
      </div>
    </Page>
  )
}

function NotificationsAppBanner() {
  return (
    <Row className="bg-primary-100 relative mb-2 justify-between rounded-md px-4 py-2 text-sm">
      <Row className={'text-ink-600 items-center gap-3 text-sm sm:text-base'}>
        Get the app for the best experience
        <AppBadgesOrGetAppButton />
      </Row>
      <button
        onClick={() => {
          track('close app banner')
          api('me/private/update', {
            hasSeenAppBannerInNotificationsOn: Date.now(),
          })
        }}
      >
        <XIcon className="text-ink-600 hover:text-ink-800 h-6 w-6" />
      </button>
    </Row>
  )
}

function NotificationsContent(props: {
  privateUser: PrivateUser
  user: User
  section?: string
}) {
  const { privateUser, user, section } = props
  const {
    groupedNotifications,
    mostRecentNotification,
    groupedBalanceChangeNotifications,
    groupedNewMarketNotifications,
    groupedMentionNotifications,
  } = useGroupedNotifications(user)
  const [unseenNewMarketNotifs, setNewMarketNotifsAsSeen] = useState(
    groupedNewMarketNotifications?.filter((n) => !n.isSeen).length ?? 0
  )

  return (
    <div className="relative mt-2 h-full w-full">
      {privateUser && (
        <QueryUncontrolledTabs
          trackingName={'notification tabs'}
          labelClassName={'relative pb-2 pt-1 '}
          className={'mb-0 sm:mb-2'}
          onClick={(title) =>
            title === 'Following' ? setNewMarketNotifsAsSeen(0) : null
          }
          labelsParentClassName={'gap-3'}
          tabs={[
            {
              title: 'General',
              content: (
                <NotificationsList
                  privateUser={privateUser}
                  groupedNotifications={groupedNotifications}
                  mostRecentNotification={mostRecentNotification}
                />
              ),
            },
            {
              title: 'Following',
              inlineTabIcon:
                unseenNewMarketNotifs > 0 ? (
                  <div
                    className={
                      'text-ink-0 bg-primary-400 ml-2 min-w-[15px] rounded-full px-2 text-xs'
                    }
                  >
                    {unseenNewMarketNotifs}
                  </div>
                ) : undefined,
              content: (
                <NotificationsList
                  groupedNotifications={groupedNewMarketNotifications}
                  emptyTitle={
                    'You don’t have any new question notifications from followed users, yet. Try following some users to see more.'
                  }
                />
              ),
            },
            {
              title: 'Mentions',
              content: (
                <NotificationsList
                  groupedNotifications={groupedMentionNotifications}
                />
              ),
            },
            {
              title: 'Mana',
              content: (
                <NotificationsList
                  groupedNotifications={groupedBalanceChangeNotifications}
                />
              ),
            },
            {
              queryString: 'Settings',
              title: 'Settings',
              content: <NotificationSettings navigateToSection={section} />,
            },
          ]}
        />
      )}
    </div>
  )
}

function RenderNotificationGroups(props: {
  notificationGroups: NotificationGroup[]
  totalItems: number
  page: number
  setPage: (page: number) => void
}) {
  const { notificationGroups, page, setPage, totalItems } = props

  const grayLine = <div className="bg-ink-300 mx-2 box-border h-[1.5px]" />
  return (
    <>
      {notificationGroups.map((notification) => (
        <Fragment key={notification.groupedById}>
          {notification.notifications.length === 1 ? (
            <>
              <NotificationItem
                notification={notification.notifications[0]}
                key={notification.notifications[0].id}
              />
              {grayLine}
            </>
          ) : (
            <>
              <NotificationGroupItem
                notificationGroup={notification}
                key={notification.groupedById}
              />
              {grayLine}
            </>
          )}
        </Fragment>
      ))}
      {notificationGroups.length > 0 && totalItems > NOTIFICATIONS_PER_PAGE && (
        <Pagination
          page={page}
          pageSize={NOTIFICATIONS_PER_PAGE}
          totalItems={totalItems}
          setPage={setPage}
          savePageToQuery={true}
        />
      )}
    </>
  )
}

export function NotificationsList(props: {
  groupedNotifications: NotificationGroup[] | undefined
  privateUser?: PrivateUser
  mostRecentNotification?: Notification
  emptyTitle?: string
}) {
  const {
    privateUser,
    emptyTitle,
    groupedNotifications,
    mostRecentNotification,
  } = props
  const [page, setPage] = useState(0)
  const user = useUser()

  const paginatedGroupedNotifications = useMemo(() => {
    const start = page * NOTIFICATIONS_PER_PAGE
    const end = start + NOTIFICATIONS_PER_PAGE
    return groupedNotifications?.slice(start, end)
  }, [JSON.stringify(groupedNotifications), page])

  const isPageVisible = useIsPageVisible()

  // Mark all notifications as seen. Rerun as new notifications come in.
  useEffect(() => {
    if (!privateUser || !isPageVisible) return
    markAllNotifications({ seen: true })
  }, [privateUser?.id, isPageVisible, mostRecentNotification?.id])

  return (
    <Col className={'min-h-[100vh] gap-0 text-sm'}>
      {groupedNotifications === undefined ||
      paginatedGroupedNotifications === undefined ? (
        <LoadingIndicator />
      ) : paginatedGroupedNotifications.length === 0 ? (
        <div className={'mt-2'}>
          {emptyTitle ? emptyTitle : `You don't have any notifications, yet.`}
        </div>
      ) : (
        <RenderNotificationGroups
          notificationGroups={paginatedGroupedNotifications}
          totalItems={groupedNotifications.length}
          page={page}
          setPage={setPage}
        />
      )}
      {privateUser && groupedNotifications && user && (
        <PushNotificationsModal
          user={user}
          privateUser={privateUser}
          totalNotifications={
            groupedNotifications.map((ng) => ng.notifications).flat().length
          }
        />
      )}
    </Col>
  )
}

function NotificationGroupItem(props: {
  notificationGroup: NotificationGroup
  className?: string
}) {
  const { notificationGroup } = props
  const { notifications } = notificationGroup
  const [groupHighlighted] = useState(notifications.some((n) => !n.isSeen))
  const { sourceTitle, sourceContractTitle } = notifications[0]
  const incomeTypesToSum = ['bonus', 'tip', 'tip_and_like']
  const uniques = Object.keys(
    groupBy(notifications, (n) => n.sourceUserUsername)
  ).length
  const combinedNotifs = sortBy(
    combineReactionNotifications(
      notifications.filter((n) =>
        ReactionNotificationTypes.includes(n.sourceType)
      )
    )
      .concat(
        notifications.filter(
          (n) =>
            !ReactionNotificationTypes.includes(n.sourceType) &&
            !incomeTypesToSum.includes(n.sourceType)
        )
      )
      .concat(
        combineAndSumIncomeNotifications(
          notifications.filter((n) => incomeTypesToSum.includes(n.sourceType))
        )
      ),
    'createdTime'
  ).reverse()
  const onboardingNotifs = notifications.some(
    (n) => n.reason === 'onboarding_flow'
  )
  const questNotifs = notifications.some(
    (n) =>
      n.reason === 'quest_payout' || n.sourceType === 'betting_streak_bonus'
  )

  return (
    <NotificationGroupItemComponent
      notifications={combinedNotifs}
      lines={onboardingNotifs ? 5 : NUM_SUMMARY_LINES}
      header={
        <ParentNotificationHeader highlighted={groupHighlighted}>
          {notifications.some(
            (n) => n.reason === 'contract_from_followed_user'
          ) ? (
            <>
              {notifications.length} new questions from{' '}
              {notifications[0].sourceUserName}
            </>
          ) : onboardingNotifs ? (
            <>Welcome to Manifold!</>
          ) : questNotifs ? (
            <>
              {notifications.length} quest
              {notifications.length > 1 ? 's' : ''} completed
            </>
          ) : sourceTitle || sourceContractTitle ? (
            <>
              {uniques} user{uniques > 1 ? `s` : ``} on{' '}
              <QuestionOrGroupLink
                notification={notifications[0]}
                truncatedLength={'xl'}
              />
            </>
          ) : (
            <>
              Other activity from {uniques} user{uniques > 1 ? 's' : ''}
            </>
          )}
        </ParentNotificationHeader>
      }
    />
  )
}

function NotificationGroupItemComponent(props: {
  notifications: Notification[]
  header: ReactNode
  lines: number
}) {
  const { notifications, lines, header } = props
  const numNotifications = notifications.length

  const needsExpanding = numNotifications > lines
  const [expanded, setExpanded] = useState(false)
  const onExpandHandler = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) return
    setExpanded(!expanded)
  }

  const shownNotifications = expanded
    ? notifications
    : notifications.slice(0, lines)
  return (
    <div>
      {header}
      <div className="relative whitespace-pre-line last:[&>*]:pb-6 sm:last:[&>*]:pb-4">
        {needsExpanding && (
          <div className={clsx('absolute bottom-0 right-4')}>
            <ShowMoreLessButton
              onClick={onExpandHandler}
              isCollapsed={!expanded}
              howManyMore={numNotifications - lines}
            />
          </div>
        )}
        {shownNotifications.map((notification) => {
          return (
            <NotificationItem
              notification={notification}
              key={notification.id}
              isChildOfGroup={shownNotifications.length > 1}
            />
          )
        })}
      </div>
    </div>
  )
}
