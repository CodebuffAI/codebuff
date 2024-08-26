import { useRouter } from 'next/router'
import { ENV_CONFIG } from 'common/envs/constants'
import { useEffect } from 'react'

export const useGoogleAnalytics = () => {
  const router = useRouter()

  useEffect(() => {
    const handleRouteChange = (url: string) => {
      ;(window as any).gtag('config', ENV_CONFIG.googleAnalyticsId, {
        page_path: url,
      })
    }
    router.events.on('routeChangeComplete', handleRouteChange)
    return () => {
      router.events.off('routeChangeComplete', handleRouteChange)
    }
  }, [router.events])
}
