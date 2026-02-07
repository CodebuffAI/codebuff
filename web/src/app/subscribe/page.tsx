import type { Metadata } from 'next'

import SubscribeClient from './subscribe-client'

export const metadata: Metadata = {
  title: 'Subscribe | Codebuff',
  description: 'Subscribe to Codebuff for the best credit rates.',
}

export const dynamic = 'force-static'

export default function SubscribePage() {
  return <SubscribeClient />
}
