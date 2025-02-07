'use client'

import { useState, useEffect } from 'react'
import posthog from 'posthog-js'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePostHog } from '@/lib/PostHogProvider'

export function CookieConsentCard() {
  const [visible, setVisible] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const { reinitialize } = usePostHog()

  useEffect(() => {
    // const consent = localStorage.getItem('cookieConsent')
    // if (!consent) {
    //   setVisible(true)
    // }

    const handleScroll = () => {
      const scrollPosition = window.scrollY
      // Start fading out after 100px of scroll
      if (scrollPosition > 100) {
        setOpacity(Math.max(0, 1 - (scrollPosition - 100) / 200))
      } else {
        setOpacity(1)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'true')
    setVisible(false)
    reinitialize()
    posthog.capture('cookie_consent.accepted')
  }

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'false')
    setVisible(false)
    posthog.capture('cookie_consent.declined')
  }

  if (!visible || !opacity) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-8 md:right-auto md:max-w-[280px] z-50 transition-opacity duration-200"
      style={{ opacity }}
    >
      <Card className="bg-background/80 backdrop-blur-sm">
        <CardContent className="flex flex-col gap-3 p-4">
          <p className="text-xs text-muted-foreground">
            We use cookies to enhance your experience. By clicking "Accept", you
            agree to our use of cookies.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="xs"
              onClick={handleDecline}
              className="text-xs h-7 px-2"
            >
              Decline
            </Button>
            <Button
              size="xs"
              onClick={handleAccept}
              className="text-xs h-7 px-2"
            >
              Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
