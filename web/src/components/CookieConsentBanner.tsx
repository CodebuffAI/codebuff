'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function CookieConsentBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent')
    if (!consent) {
      setVisible(true)
    }
  }, [])

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'true')
    setVisible(false)
    // Reload the page to initialize PostHog after consent
    window.location.reload()
  }

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'false')
    setVisible(false)
  }

  if (!visible) {
    return null
  }

  return (
    <div
      className={cn(
        'fixed bottom-0 inset-x-0 p-4 bg-gray-800 text-white flex flex-col md:flex-row items-center justify-between',
        'z-50'
      )}
    >
      <p className="mb-4 md:mb-0">
        We use cookies to enhance your experience. By clicking "Accept", you agree to our use of cookies.
      </p>
      <div className="flex gap-4">
        <Button variant="outline" onClick={handleDecline}>
          Decline
        </Button>
        <Button onClick={handleAccept}>Accept</Button>
      </div>
    </div>
  )
}
