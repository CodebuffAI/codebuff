import { getServerSession } from 'next-auth'
import { redirect } from 'next/navigation'

import type { Metadata } from 'next'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'

export const metadata: Metadata = {
  title: 'Chat',
  description: 'Free AI chat by Freebuff. No subscription, no catch.',
}

export default async function ChatLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) {
    redirect('/login?callbackUrl=%2Fchat')
  }
  return <div className="fixed inset-0 bg-background">{children}</div>
}
