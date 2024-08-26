import type { Headline } from 'common/news'
import { useUser } from 'web/hooks/use-user'
import { Carousel } from 'web/components/widgets/carousel'
import { isAdminId, isModId } from 'common/envs/constants'
import { EditNewsButton } from 'web/components/news/edit-news-button'
import { track } from 'web/lib/service/analytics'
import clsx from 'clsx'
import { DashboardEndpoints } from 'web/components/dashboard/dashboard-page'

export function MultiDashboardHeadlineTabs(props: {
  headlines: Headline[]
  currentSlug: string
  onClick: (slug: string) => void
  endpoint: DashboardEndpoints
  topSlug: string
}) {
  const { headlines, topSlug, endpoint, currentSlug, onClick } = props
  const user = useUser()

  return (
    <div className="bg-canvas-50 sticky top-0 z-50 mb-3 w-full">
      <Carousel labelsParentClassName="gap-px">
        {headlines.map(({ id, slug, title }) => (
          <Tab
            key={id}
            label={title}
            onClick={() => onClick(slug)}
            active={slug === currentSlug}
          />
        ))}
        {user && (isAdminId(user.id) || isModId(user.id)) && (
          <EditNewsButton
            defaultDashboards={headlines.filter(
              (headline) => headline.id !== topSlug
            )}
            endpoint={endpoint}
          />
        )}
      </Carousel>
    </div>
  )
}

const Tab = (props: {
  onClick: () => void
  label: string
  active: boolean
}) => {
  const { onClick, label, active } = props
  return (
    <span
      onClick={() => {
        track('politics news tabs', { tab: label })
        onClick()
      }}
      className={clsx(
        'text-ink-600 hover:bg-primary-100 hover:text-primary-700 focus-visible:bg-primary-100 focus-visible:text-primary-700 max-w-[40ch] cursor-pointer text-ellipsis whitespace-nowrap px-3 py-2 text-sm font-bold outline-none',
        active && 'bg-primary-200 text-primary-900'
      )}
    >
      {label}
    </span>
  )
}
