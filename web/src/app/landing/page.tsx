import { LandingPage } from '@/components/landing/LandingPage'

import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Freebuff — We make coding 100% free',
  description:
    'No subscriptions. No API keys. Start in seconds. The free coding agent for your terminal, web, and chat.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <LandingPage />
}
