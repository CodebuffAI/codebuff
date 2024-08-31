'use client'
import { BellIcon } from '@heroicons/react/outline'
import { Row } from 'web/components/layout/row'
import { useEffect } from 'react'
import { usePrivateUser } from 'web/hooks/use-user'
import { useGroupedUnseenNotifications } from 'web/hooks/use-notifications'
import { PrivateUser } from 'common/user'
import { NOTIFICATIONS_PER_PAGE } from './notifications/notification-helpers'

import { usePathname } from 'next/navigation'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export function NotificationsIcon(props: { className?: string }) {
  const privateUser = usePrivateUser()
  const { className } = props

  return (
    <Row className="relative justify-center">
      {privateUser && <UnseenNotificationsBubble privateUser={privateUser} />}
      <BellIcon className={className} />
    </Row>
  )
}

function UnseenNotificationsBubble(props: { privateUser: PrivateUser }) {
  const pathname = usePathname()
  const { privateUser } = props
  const [lastSeenTime, setLastSeenTime] = usePersistentLocalState(
    0,
    'notifications-seen-time'
  )
  const unseenNotificationGroups =
    useGroupedUnseenNotifications(privateUser.id) ?? []

  const unseenNotifs = unseenNotificationGroups.filter(
    (ng) => ng.latestCreatedTime > lastSeenTime
  ).length

  useEffect(() => {
    if (pathname?.endsWith('notifications')) {
      setLastSeenTime(Date.now())
    }
  }, [pathname, unseenNotifs])

  if (unseenNotifs === 0) {
    return null
  }

  return (
    <div className="-mt-0.75 text-ink-0 bg-primary-500 absolute ml-3.5 min-w-[15px] rounded-full p-[2px] text-center text-[10px] leading-3 lg:left-0 lg:-mt-1 lg:ml-2">
      {unseenNotifs > NOTIFICATIONS_PER_PAGE
        ? `${NOTIFICATIONS_PER_PAGE}+`
        : unseenNotifs}
    </div>
  )
}
