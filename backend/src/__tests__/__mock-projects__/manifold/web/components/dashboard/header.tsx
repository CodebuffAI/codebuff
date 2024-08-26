import clsx from 'clsx'
import { isAdminId, isModId } from 'common/envs/constants'
import { type Headline } from 'common/news'
import Link from 'next/link'
import { EditNewsButton } from 'web/components/news/edit-news-button'
import { Carousel } from 'web/components/widgets/carousel'
import { useUser } from 'web/hooks/use-user'
import { track } from 'web/lib/service/analytics'
import { DashboardEndpoints } from 'web/components/dashboard/dashboard-page'
import { removeEmojis } from 'common/util/string'

export function HeadlineTabs(props: {
  headlines: Headline[]
  currentSlug: string
  endpoint: DashboardEndpoints
  hideEmoji?: boolean
  notSticky?: boolean
  className?: string
}) {
  const { headlines, endpoint, currentSlug, hideEmoji, notSticky, className } =
    props
  const user = useUser()

  return (
    <div
      className={clsx(
        className,
        'bg-canvas-50 w-full',
        !notSticky && 'sticky top-0 z-50'
      )}
    >
      <Carousel labelsParentClassName="gap-px">
        {user && <Tab label="US Election" href="/election" />}
        {headlines.map(({ id, slug, title }) => (
          <Tab
            key={id}
            label={hideEmoji ? removeEmojis(title) : title}
            href={`/${endpoint}/${slug}`}
            active={slug === currentSlug}
          />
        ))}
        {user && <Tab label="More" href="/dashboard" />}
        {user && (isAdminId(user.id) || isModId(user.id)) && (
          <EditNewsButton endpoint={endpoint} defaultDashboards={headlines} />
        )}
      </Carousel>
    </div>
  )
}

const Tab = (props: { href: string; label: string; active?: boolean }) => {
  const { href, label, active } = props
  return (
    <Link
      prefetch={false}
      href={href}
      onClick={() => track('news tabs', { tab: label, href })}
      className={clsx(
        'text-ink-600 hover:bg-primary-100 hover:text-primary-700 focus-visible:bg-primary-100 focus-visible:text-primary-700 max-w-[40ch] text-ellipsis whitespace-nowrap px-3 py-2 text-sm font-bold outline-none',
        active && 'bg-primary-200 text-primary-900'
      )}
    >
      {label}
    </Link>
  )
}
