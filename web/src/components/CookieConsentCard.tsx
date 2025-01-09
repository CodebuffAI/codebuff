'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { usePostHog } from '@/lib/PostHogProvider'

export function CookieConsentCard() {
  const [visible, setVisible] = useState(false)
  const [opacity, setOpacity] = useState(1)
  const { reinitialize } = usePostHog()

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (!consent) {
      setVisible(true)
    }

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
  }

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'false')
    setVisible(false)
  }

  if (!visible || !opacity) {
    return null
  }

  return (
    <div
      className="fixed bottom-4 left-4 right-4 md:left-8 md:right-auto z-50 transition-opacity duration-200"
      style={{ opacity }}
    >
      <Card className="md:max-w-sm bg-background/80 backdrop-blur-sm">
        <CardContent className="flex flex-col gap-4 p-4">
          <p className="text-xs text-muted-foreground">
            We use cookies to enhance your experience. By clicking "Accept", you
            agree to our use of cookies.
          </p>
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              size="xs"
              onClick={handleDecline}
              className="text-xs"
            >
              Decline
            </Button>
            <Button size="xs" onClick={handleAccept} className="text-xs">
              Accept
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
