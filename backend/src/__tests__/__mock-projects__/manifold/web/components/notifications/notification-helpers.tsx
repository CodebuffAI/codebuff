import clsx from 'clsx'
import { getSourceUrl, Notification } from 'common/notification'
import Link from 'next/link'
import { ReactNode } from 'react'
import { Col } from 'web/components/layout/col'
import { Avatar } from 'web/components/widgets/avatar'
import { Linkify } from 'web/components/widgets/linkify'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { RelativeTimestampNoTooltip } from '../relative-timestamp'
import { truncateText } from '../widgets/truncate'
import NotificationDropdown from './notification-dropdown'
import { groupBy } from 'lodash'
import { SparklesIcon } from '@heroicons/react/solid'
import { UserLink } from '../widgets/user-link'
import { UserHovercard } from '../user/user-hovercard'

export const NOTIFICATIONS_PER_PAGE = 30

function getHighlightClass(highlight: boolean) {
  return highlight ? 'text-ink-1000 bg-primary-50' : 'text-ink-700'
}
export const NUM_SUMMARY_LINES = 3

export const NOTIFICATION_ICON_SIZE = 'md'

// TODO: fix badges (id based)
export function NotificationUserLink(props: {
  userId?: string
  name?: string
  username?: string
  className?: string
  hideBadge?: boolean
}) {
  const { userId, name, username, className, hideBadge } = props
  return (
    <UserHovercard userId={userId ?? ''}>
      <UserLink
        user={{ id: userId || '', name: name || '', username: username || '' }}
        className={clsx(
          className ?? 'hover:text-primary-500 relative flex-shrink-0'
        )}
        hideBadge={hideBadge}
      />
    </UserHovercard>
  )
}

export function PrimaryNotificationLink(props: {
  text: string | undefined
  truncatedLength?: 'sm' | 'md' | 'lg' | 'xl' | 'none'
}) {
  const { text, truncatedLength } = props
  if (!text) {
    return <></>
  }
  return (
    <span className="hover:text-primary-500 font-semibold transition-colors">
      {truncatedLength ? truncateText(text, truncatedLength ?? 'xl') : text}
    </span>
  )
}

export function QuestionOrGroupLink(props: {
  notification: Notification
  truncatedLength?: 'sm' | 'md' | 'lg' | 'xl' | 'none'
  ignoreClick?: boolean
}) {
  const { notification, ignoreClick, truncatedLength } = props
  const {
    sourceType,
    sourceContractTitle,
    sourceContractCreatorUsername,
    sourceContractSlug,
    sourceSlug,
    sourceTitle,
  } = notification

  let title = sourceContractTitle || sourceTitle
  if (truncatedLength) {
    title = truncateText(title, truncatedLength)
  }

  if (ignoreClick) return <span className={'font-bold '}>{title}</span>
  return (
    <Link
      className={'hover:text-primary-500 relative font-semibold'}
      href={getSourceUrl(notification).split('#')[0]}
      onClick={(e) => {
        e.stopPropagation()
        track('Notification Clicked', {
          type: 'question title',
          sourceType,
          sourceContractTitle,
          sourceContractCreatorUsername,
          sourceContractSlug,
          sourceSlug,
          sourceTitle,
        })
      }}
    >
      {title}
    </Link>
  )
}

export function NotificationTextLabel(props: {
  notification: Notification
  className?: string
}) {
  const { className, notification } = props
  const { sourceText, reasonText } = notification
  const defaultText = sourceText ?? reasonText ?? ''
  return (
    <div className={className ? className : 'line-clamp-4 whitespace-pre-line'}>
      <Linkify text={defaultText} />
    </div>
  )
}

export function AvatarNotificationIcon(props: {
  notification: Notification
  symbol: string | ReactNode
}) {
  const { notification, symbol } = props
  const { sourceUserName, sourceUserAvatarUrl, sourceUserUsername } =
    notification
  const href = `/${sourceUserUsername}`
  return (
    <div className="relative">
      <Link
        href={href}
        target={href.startsWith('http') ? '_blank' : undefined}
        onClick={(e) => e.stopPropagation}
      >
        <Avatar
          username={sourceUserName}
          avatarUrl={sourceUserAvatarUrl}
          size={NOTIFICATION_ICON_SIZE}
          noLink={true}
        />
        <div className="absolute -bottom-2 -right-1 text-lg">{symbol}</div>
      </Link>
    </div>
  )
}

export function NotificationIcon(props: {
  symbol: string | ReactNode
  symbolBackgroundClass: string
}) {
  const { symbol, symbolBackgroundClass } = props
  return (
    <Col
      className={clsx(
        'h-10 w-10 justify-center rounded-full',
        symbolBackgroundClass
      )}
    >
      <div className="mx-auto text-2xl">{symbol}</div>
    </Col>
  )
}

// the primary skeleton for notifications
export function NotificationFrame(props: {
  notification: Notification
  highlighted: boolean
  setHighlighted: (highlighted: boolean) => void
  children: React.ReactNode
  icon: ReactNode
  link?: string
  onClick?: () => void
  subtitle?: string | ReactNode
  isChildOfGroup?: boolean
  customBackground?: ReactNode
}) {
  const {
    notification,
    highlighted,
    setHighlighted,
    children,
    icon,
    subtitle,
    onClick,
    link,
    customBackground,
  } = props
  const isMobile = useIsMobile()

  const frameObject = (
    <Row className="cursor-pointer text-sm md:text-base">
      <Row className="w-full items-start gap-3">
        <Col className="relative h-full w-10 items-center">{icon}</Col>
        <Col className="font w-full">
          <span>{children}</span>
          <div className="mt-1 line-clamp-3 text-xs md:text-sm">{subtitle}</div>
        </Col>

        <Row className="mt-1 items-center justify-end gap-1 pr-1 sm:w-36">
          {highlighted && !isMobile && (
            <SparklesIcon className="text-primary-600 h-4 w-4" />
          )}
          <RelativeTimestampNoTooltip
            time={notification.createdTime}
            shortened={isMobile}
            className={clsx(
              'text-xs',
              highlighted ? 'text-primary-600' : 'text-ink-700'
            )}
          />
        </Row>
      </Row>
    </Row>
  )

  return (
    <Row
      className={clsx(
        'hover:bg-primary-100 group p-2 transition-colors',
        getHighlightClass(highlighted)
      )}
    >
      {customBackground}
      {link && (
        <Col className={'w-full'}>
          <Link
            href={link}
            className={clsx('flex w-full flex-col')}
            onClick={() => {
              if (highlighted) {
                setHighlighted(false)
              }
            }}
          >
            {frameObject}
          </Link>
        </Col>
      )}
      {!link && (
        <Col
          className={'w-full'}
          onClick={() => {
            if (highlighted) {
              setHighlighted(false)
            }
            if (onClick) {
              onClick()
            }
          }}
        >
          {frameObject}
        </Col>
      )}

      <div className="self-start">
        <NotificationDropdown notification={notification} />
      </div>
    </Row>
  )
}

export function ParentNotificationHeader(props: {
  children: ReactNode
  highlighted: boolean
}) {
  const { children, highlighted } = props
  const highlightedClass = getHighlightClass(highlighted)

  return (
    <div className={clsx('line-clamp-3 px-2 pt-3 text-base', highlightedClass)}>
      {children}
    </div>
  )
}
export function combineReactionNotifications(notifications: Notification[]) {
  const groupedNotificationsBySourceType = groupBy(
    notifications,
    (n) =>
      `${n.sourceType}-${
        n.sourceTitle ?? n.sourceContractTitle ?? n.sourceContractId
      }-${n.sourceText}`
  )

  const newNotifications = Object.values(groupedNotificationsBySourceType).map(
    (notifications) => {
      const mostRecentNotification = notifications[0]

      return {
        ...mostRecentNotification,
        data: {
          ...mostRecentNotification.data,
          relatedNotifications: notifications,
        },
      }
    }
  )

  return newNotifications as Notification[]
}
