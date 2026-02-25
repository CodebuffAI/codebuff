'use client'

import { useSession } from 'next-auth/react'

import { ProfileSection } from './profile-section'

import { Badge } from '@/components/ui/badge'

export function AccountSection() {
  const { data: session } = useSession()
  const email = session?.user?.email

  return (
    <ProfileSection
      description="Your account information and settings."
    >
      <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">Email</p>
          <p className="text-lg font-medium truncate">{email || '-'}</p>
        </div>
        <Badge variant="secondary">
          {session?.user?.email ? 'Verified' : 'Unverified'}
        </Badge>
      </div>
    </ProfileSection>
  )
}