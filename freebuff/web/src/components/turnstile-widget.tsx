'use client'

import Script from 'next/script'
import { useEffect, useRef, useState } from 'react'

export function TurnstileWidget({
  siteKey,
  onVerify,
  onError,
  onExpired,
}: {
  siteKey: string
  onVerify: (token: string) => void
  onError: (errorCode: string) => void
  onExpired: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<string | undefined>(undefined)
  const onVerifyRef = useRef(onVerify)
  const onErrorRef = useRef(onError)
  const onExpiredRef = useRef(onExpired)
  onVerifyRef.current = onVerify
  onErrorRef.current = onError
  onExpiredRef.current = onExpired

  const [scriptLoaded, setScriptLoaded] = useState(false)

  useEffect(() => {
    if (
      !scriptLoaded ||
      !containerRef.current ||
      !window.turnstile ||
      widgetIdRef.current !== undefined
    ) {
      return
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      callback: (token: string) => onVerifyRef.current(token),
      'error-callback': (errorCode: string) => onErrorRef.current(errorCode),
      'expired-callback': () => onExpiredRef.current(),
    })

    return () => {
      if (widgetIdRef.current !== undefined && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = undefined
      }
    }
  }, [scriptLoaded, siteKey])

  return (
    <>
      <link rel="preconnect" href="https://challenges.cloudflare.com" />
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        onLoad={() => setScriptLoaded(true)}
      />
      <div ref={containerRef} />
    </>
  )
}
