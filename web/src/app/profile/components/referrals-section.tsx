'use client'

import { env } from '@codebuff/common/env'
import { useQuery } from '@tanstack/react-query'
import { Forward } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { match, P } from 'ts-pattern'

import { ProfileSection } from './profile-section'

import type { ReferralData } from '@/app/api/referrals/route'

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

const CreditsBadge = ({
  credits,
  isLegacy,
}: {
  credits: number
  isLegacy: boolean
}) => {
  return (
    <span
      className={`flex-none p-2 rounded-full text-xs bg-gradient-to-r from-green-300 to-emerald-300 dark:from-green-600 dark:to-emerald-600 text-green-800 dark:text-white font-semibold item-center text-center shadow-sm`}
    >
      +{credits} credits{isLegacy && ' per month'}
    </span>
  )
}

export function ReferralsSection() {
  const { data: session, status } = useSession()
  const { data, error, isLoading } = useQuery<ReferralData>({
    queryKey: ['referrals'],
    queryFn: async () => {
      const response = await fetch('/api/referrals')
      const ret = await response.json()
      if (!response.ok) {
        throw new Error(`Failed to fetch referral data: ${ret.error}`)
      }
      return ret
    },
    enabled: !!session?.user,
  })
  const loading = isLoading || status === 'loading'

  if (error) {
    return (
      <ProfileSection>
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">
              Error Loading Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p>We couldn't fetch your referral data.</p>
            <code className="text-sm">
              {error instanceof Error ? error.message : 'Unknown error'}
            </code>
          </CardContent>
        </Card>
      </ProfileSection>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <ProfileSection>
        <Card>
          <CardHeader>
            <CardTitle>You're not logged in.</CardTitle>
            <CardDescription>
              Log in to access your referrals.
            </CardDescription>
          </CardHeader>
        </Card>
      </ProfileSection>
    )
  }

  return (
    <ProfileSection>
      {data?.referredBy && (
        <Card className="bg-gradient-to-br from-green-100/90 to-emerald-100/90 dark:from-green-900/90 dark:to-emerald-900/90 border border-green-200 dark:border-green-800 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center text-green-800 dark:text-green-200">
              <Forward className="mr-2" /> You claimed a referral bonus. You
              rock! 🤘
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            <div className="flex place-content-between">
              <div className="text-sm flex items-center">
                <p>{data.referredBy.name} referred you. </p>
              </div>
              <CreditsBadge
                credits={data.referredBy.credits}
                isLegacy={data.referredBy.is_legacy}
              />
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-to-br from-green-50/90 to-emerald-50/90 dark:from-green-950/90 dark:to-emerald-950/90 border border-green-200 dark:border-green-800 shadow-lg">
        <CardHeader>
          <CardTitle className="text-green-800 dark:text-green-200">
            Your Referrals
          </CardTitle>
        </CardHeader>
        <CardContent>
          {match({
            loading,
            data,
          })
            .with(
              {
                loading: true,
              },
              () => (
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-4/6" />
                </div>
              ),
            )
            .with(
              {
                loading: false,
                data: P.not(undefined),
              },
              ({ data }) => (
                <div className="space-y-4">
                  <div>
                    You've referred <b>{data.referrals.length}</b>{' '}
                    {data.referrals.length === 1 ? 'person' : 'people'}.
                  </div>
                  {data.referrals.length !== 0 && (
                    <ul className="space-y-2">
                      {data.referrals.map((r) => (
                        <li
                          key={r.id}
                          className="flex justify-between items-center"
                        >
                          <span>
                            {r.name} ({r.email}){r.is_legacy && ' (legacy)'}
                          </span>
                          <CreditsBadge credits={r.credits} isLegacy={r.is_legacy} />
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )
            .otherwise(() => (
              <p>
                Uh-oh, something went wrong. Try again or reach out to{' '}
                {env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.
              </p>
            ))}
        </CardContent>
      </Card>
    </ProfileSection>
  )
}
