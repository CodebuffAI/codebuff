import { XIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

import { IconButton } from '../buttons/button'
import { Row } from '../layout/row'
import { LogoIcon } from '../icons/logo-icon'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'

export function Banner(props: {
  setShowBanner?: (show: boolean) => void
  className?: string
  children: React.ReactNode
  link?: string
}) {
  const { setShowBanner, className, children, link } = props
  return (
    <Row
      className={clsx(
        className,
        'text-ink-900 bg-primary-100 z-10 justify-between gap-4'
      )}
    >
      <a href={link} className="pl-4" target="_blank" rel="noopener noreferrer">
        {children}
      </a>

      {setShowBanner && (
        <IconButton
          className={'h-8'}
          size={'sm'}
          onClick={() => {
            setShowBanner(false)
          }}
        >
          <XIcon className="text-ink-700 h-5 w-5" />
        </IconButton>
      )}
    </Row>
  )
}

export function PivotBanner(props: { hideBanner: () => void }) {
  const { hideBanner } = props
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 border bg-gradient-to-b"
      link="https://news.manifold.markets/p/exploring-cash-prizes-for-good-predictions"
      setShowBanner={hideBanner}
    >
      <Row className="gap-2">
        <LogoIcon
          className="h-6 w-6 flex-shrink-0 text-black dark:text-white"
          height={24}
          width={24}
          aria-hidden
          strokeWidth={1}
        />
        <div>
          <span className="font-semibold">Coming soon!</span> Cash prizes and
          other changes. Read more
        </div>
      </Row>
    </Banner>
  )
}

export function ManifestBanner(props: { hideBanner: () => void }) {
  const { hideBanner } = props
  return (
    <Banner
      className="border-primary-300 from-primary-100 to-primary-200 border bg-gradient-to-b"
      link="https://manifest.is"
      setShowBanner={hideBanner}
    >
      <Row className="gap-2">
        <LogoIcon
          className="h-6 w-6 flex-shrink-0 text-black dark:text-white"
          height={24}
          width={24}
          aria-hidden
          strokeWidth={1}
        />
        <div>
          <span className="font-semibold">Get tickets to Manifest 2024 🥳</span>{' '}
          — our second forecasting festival, June 7-9 in Berkeley, CA
        </div>
      </Row>
    </Banner>
  )
}

export function DowntimeBanner() {
  return (
    <Banner className="border-primary-300 from-primary-100 to-primary-200 border bg-gradient-to-b">
      ⚠️ Manifold will be down at 9PM PT for about 1 hour, as we upgrade our
      financial infrastructure.
    </Banner>
  )
}

export const useBanner = (name: string) => {
  const [bannerSeen, setBannerSeen] = usePersistentLocalState<number>(
    0,
    `${name}-banner-seen`
  )

  return [!bannerSeen, () => setBannerSeen(1)] as const
}
