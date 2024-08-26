import clsx from 'clsx'
import { ReactNode } from 'react'
import { BottomNavBar } from '../nav/bottom-nav-bar'
import Sidebar from '../nav/sidebar'
import { Toaster } from 'react-hot-toast'
import { useIsMobile } from 'web/hooks/use-is-mobile'
import { Col } from './col'
import { GoogleOneTapLogin } from 'web/lib/firebase/google-onetap-login'
import { ConfettiOnDemand } from '../confetti-on-demand'
import { useTracking } from 'web/hooks/use-tracking'
import { DowntimeBanner } from '../nav/banner'
import { useUser } from 'web/hooks/use-user'

export function Page(props: {
  trackPageView: string | false
  trackPageProps?: Record<string, any>
  className?: string
  children?: ReactNode
  hideSidebar?: boolean
  hideBottomBar?: boolean
  banner?: ReactNode
}) {
  const {
    trackPageView,
    trackPageProps,
    children,
    className,
    hideSidebar,
    hideBottomBar,
    banner,
  } = props

  // Force enable maintainance banner.
  const maintainanceBannerEnabled = false

  // eslint-disable-next-line react-hooks/rules-of-hooks
  trackPageView && useTracking(`view ${trackPageView}`, trackPageProps)
  const isMobile = useIsMobile()

  const user = useUser()

  return (
    <>
      <ConfettiOnDemand />
      <GoogleOneTapLogin className="fixed bottom-12 right-4 z-[1000]" />
      <Col
        className={clsx(
          !hideBottomBar && 'pb-[58px] lg:pb-0', // bottom bar padding
          'text-ink-1000 mx-auto min-h-screen w-full max-w-[1440px] lg:grid lg:grid-cols-12'
        )}
      >
        <Toaster
          position={isMobile ? 'bottom-center' : 'top-center'}
          containerClassName="!bottom-[70px]"
        />
        {hideSidebar ? (
          <div className="lg:col-span-2 lg:flex" />
        ) : (
          <Sidebar className="sticky top-0 hidden self-start px-2 lg:col-span-2 lg:flex" />
        )}
        <main
          className={clsx(
            'col-span-8 flex flex-1 flex-col xl:px-2',
            maintainanceBannerEnabled ? 'lg:mt-0' : 'lg:mt-6',
            className
          )}
        >
          {maintainanceBannerEnabled && user && (
            <DowntimeBanner>
              {/*🛠️ Site is undergoing maintenance, sorry for the inconvenience.*/}
            </DowntimeBanner>
          )}
          {banner}
          {children}
        </main>
      </Col>
      {!hideBottomBar && <BottomNavBar />}
    </>
  )
}
