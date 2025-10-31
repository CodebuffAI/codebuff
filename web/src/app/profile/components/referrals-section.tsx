'use client'

import { env } from '@codebuff/common/env'
import { CREDITS_REFERRAL_BONUS } from '@codebuff/common/old-constants'
import { getReferralLink } from '@codebuff/common/util/referral'
import { useQuery } from '@tanstack/react-query'
import { CopyIcon, Forward } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { match, P } from 'ts-pattern'

import { ProfileSection } from './profile-section'

import type { ReferralData } from '@/app/api/referrals/route'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'

const copyReferral = (link: string) => {
  navigator.clipboard.writeText(link)
  toast({
    title: `Copied referral link`,
    description: 'Refer away! 🌟',
  })
}

const CreditsBadge = (credits: number) => {
  return (
    <span
      className={`flex-none p-2 rounded-full text-xs bg-gradient-to-r from-green-300 to-emerald-300 dark:from-green-600 dark:to-emerald-600 text-green-800 dark:text-white font-semibold item-center text-center shadow-sm`}
    >
      +{credits} credits
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
    refetchInterval: 15000,
  })
  const loading = isLoading || status === 'loading'
  const link = data?.referralCode ? getReferralLink(data.referralCode) : ''

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
            <code className="text-sm">{(error as any).message}</code>
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
              Log in to access your referral program.
            </CardDescription>
          </CardHeader>
        </Card>
      </ProfileSection>
    )
  }

  return (
    <ProfileSection description="Share Codebuff!">
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
              {CreditsBadge(data.referredBy.credits)}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="bg-gradient-to-br from-green-50/90 to-emerald-50/90 dark:from-green-950/90 dark:to-emerald-950/90 border border-green-200 dark:border-green-800 shadow-lg">
        <CardHeader>
          <CardTitle className="text-green-800 dark:text-green-200">
            Your Referrals
          </CardTitle>
          <CardDescription className="text-green-700 dark:text-green-300">
            Refer a friend and <b>you'll both</b> earn {CREDITS_REFERRAL_BONUS}{' '}
            credits per month!{' '}
          </CardDescription>
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
                  <div>Share this link with them:</div>
                  <div className="relative">
                    {loading ? (
                      <Skeleton className="h-10 w-full" />
                    ) : (
                      <Input
                        value={link}
                        placeholder={'Your referral link'}
                        readOnly
                        className="bg-gray-100 dark:bg-gray-800 pr-10 focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0"
                      />
                    )}
                    <Button
                      onClick={() => copyReferral(link)}
                      disabled={loading || !session?.user}
                      className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-auto"
                      variant="ghost"
                    >
                      <CopyIcon className="h-4 w-4" />
                    </Button>
                  </div>

                  <Separator />

                  <div>
                    You've referred{' '}
                    <b>
                      {data.referrals.length}/{data.referralLimit}
                    </b>{' '}
                    people.{' '}
                    <Button
                      variant="link"
                      className="p-0 m-0 inline-flex"
                      asChild
                    >
                      <a
                        href={`https://codebuff.retool.com/form/e6c62a73-03b1-4ef3-8ab1-eba416ce7187?email=${session?.user?.email}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        (Wanna refer more? 🚀)
                      </a>
                    </Button>
                  </div>
                  {data.referrals.length !== 0 && (
                    <ul className="space-y-2">
                      {data.referrals.map((r) => (
                        <li
                          key={r.id}
                          className="flex justify-between items-center"
                        >
                          <span>
                            {r.name} ({r.email})
                          </span>
                          {CreditsBadge(r.credits)}
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
