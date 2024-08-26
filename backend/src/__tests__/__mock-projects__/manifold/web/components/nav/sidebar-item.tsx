import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'
import Link from 'next/link'

import { track } from 'web/lib/service/analytics'

export type NavItem = {
  name: string
  trackingEventName?: string
  href?: string
  onClick?: () => void
  icon?: React.ComponentType<{ className?: string }>
  external?: boolean
  alwaysShowName?: boolean
  prefetch?: boolean
  children?: React.ReactNode
}

export function SidebarItem(props: { item: NavItem; currentPage?: string }) {
  const { item, currentPage } = props

  const currentBasePath = '/' + (currentPage?.split('/')[1] ?? '')
  const queryCleanedHref =
    (item.href?.includes('?') ? item.href.split('?')[0] : item.href) ?? ''
  const segmentCleanedHref =
    queryCleanedHref.split('/').length > 2
      ? '/' + queryCleanedHref.split('/')[1]
      : queryCleanedHref
  const isCurrentPage = currentBasePath === segmentCleanedHref

  const onClick = () => {
    track('sidebar: ' + item.name)
    item.onClick?.()
  }

  const sidebarClass = clsx(
    isCurrentPage
      ? 'bg-ink-200 text-ink-900'
      : 'text-ink-600 hover:bg-primary-100 hover:text-ink-700',
    'group flex items-center rounded-md px-3 py-2 text-sm font-medium',
    'focus-visible:bg-primary-100 outline-none'
  )

  const sidebarItem = (
    <>
      {item.icon && (
        <item.icon
          className={clsx(
            isCurrentPage
              ? 'text-ink-600'
              : 'text-ink-500 group-hover:text-ink-600',
            '  -ml-1 mr-3 h-6 w-6 flex-shrink-0',
            item.name == 'US Politics' ? '-mt-1' : ''
          )}
          aria-hidden="true"
        />
      )}
      <span className="truncate">{item.children ?? item.name}</span>
      {item.external && <ExternalLinkIcon className="ml-2 h-4 w-4" />}
    </>
  )

  if (item.href) {
    return (
      <Link
        href={item.href}
        aria-current={isCurrentPage ? 'page' : undefined}
        onClick={onClick}
        className={sidebarClass}
      >
        {sidebarItem}
      </Link>
    )
  } else {
    return (
      <button onClick={onClick} className={sidebarClass}>
        {sidebarItem}
      </button>
    )
  }
}
