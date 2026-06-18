import HomeClient from '../home-client'

import type { Metadata } from 'next'

// Archived previous homepage. Preserved here so it can be swapped back to `/`
// at any time. Kept out of the index to avoid duplicate-content with the new
// homepage that now lives at `/`.
export const metadata: Metadata = {
  title: 'Freebuff — the free coding agent',
  description:
    'No subscriptions. No API keys. Start in seconds. The free coding agent for your terminal.',
  robots: { index: false, follow: false },
}

export default function Page() {
  return <HomeClient />
}
