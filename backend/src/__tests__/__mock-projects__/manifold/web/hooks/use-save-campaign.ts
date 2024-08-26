import { useEffect } from 'react'
import { setOnceUserProperty, track } from 'web/lib/service/analytics'

export const useSaveCampaign = () => {
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search)
    const campaign = urlParams.get('c')
    if (!campaign) return

    setOnceUserProperty('campaign', campaign)
    track('view campaign', { campaign })
  }, [])
}
