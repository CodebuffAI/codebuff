import React from 'react'

import { PendingImagesBanner } from './pending-images-banner'
import { ReferralBanner } from './referral-banner'
import { UsageBanner } from './usage-banner'
import { useChatStore } from '../state/chat-store'

/**
 * Banner component that shows contextual information below the input box.
 * Shows mode-specific banners based on the current input mode.
 */
export const InputModeBanner = () => {
  const inputMode = useChatStore((state) => state.inputMode)

  const [usageBannerShowTime, setUsageBannerShowTime] = React.useState(() =>
    Date.now(),
  )

  React.useEffect(() => {
    if (inputMode === 'usage') {
      setUsageBannerShowTime(Date.now())
    }
  }, [inputMode])

  switch (inputMode) {
    case 'default':
    case 'image':
      return <PendingImagesBanner />
    case 'usage':
      return <UsageBanner showTime={usageBannerShowTime} />
    case 'referral':
      return <ReferralBanner />
    default:
      return null
  }
}
