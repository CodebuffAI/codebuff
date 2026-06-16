'use client'

import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useEffect } from 'react'

import { ProfileSection } from './profile-section'

import type { LinkedProvidersData } from '@/app/api/account/providers/route'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { LINK_NO_MATCH_ERROR } from '@codebuff/auth/constants'

import { clearLinkIntent, startProviderLink } from '@/lib/link-provider'

const PROVIDERS: { id: string; label: string; domain: string }[] = [
  { id: 'github', label: 'GitHub', domain: 'github.com' },
  { id: 'google', label: 'Google', domain: 'google.com' },
]

const LINK_ERROR_MESSAGES: Record<string, string> = {
  [LINK_NO_MATCH_ERROR]:
    'That account isn’t linked to any Codebuff user yet. To link it, sign in with it once using the same email as this account.',
  OAuthAccountNotLinked:
    'That account is already associated with a different Codebuff user. Sign in with your original provider instead.',
}

export function ConnectionsSection() {
  const { data: session } = useSession()
  const searchParams = useSearchParams() ?? new URLSearchParams()

  const { data, isLoading } = useQuery<LinkedProvidersData>({
    queryKey: ['linked-providers'],
    queryFn: async () => {
      const response = await fetch('/api/account/providers')
      const ret = await response.json()
      if (!response.ok) {
        throw new Error(ret.error ?? 'Failed to load connected accounts')
      }
      return ret
    },
    enabled: !!session?.user,
  })

  // We've returned from any link attempt; clear the intent cookie so a later
  // unrelated sign-in isn't treated as a link. Surface any link error.
  useEffect(() => {
    clearLinkIntent()
    const error = searchParams.get('error')
    if (error && LINK_ERROR_MESSAGES[error]) {
      toast({ title: 'Could not link account', description: LINK_ERROR_MESSAGES[error] })
    }
  }, [searchParams])

  const linked = new Set(data?.providers ?? [])

  return (
    <ProfileSection description="Link GitHub and Google so you can sign in with either and always land on this same account.">
      <div className="space-y-3">
        {PROVIDERS.map((provider) => {
          const isLinked = linked.has(provider.id)
          return (
            <div
              key={provider.id}
              className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg"
            >
              <img
                src={`https://s2.googleusercontent.com/s2/favicons?domain=${provider.domain}&sz=64`}
                width={20}
                height={20}
                className="size-5 rounded-full"
                alt={`${provider.label} logo`}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{provider.label}</p>
              </div>
              {isLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : isLinked ? (
                <Badge variant="secondary">Connected</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => startProviderLink(provider.id, '/profile?tab=connections')}
                >
                  Link {provider.label}
                </Button>
              )}
            </div>
          )
        })}
      </div>
    </ProfileSection>
  )
}
