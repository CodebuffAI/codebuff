'use client'

import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { ReferralData } from '@/app/api/referrals/route'
import { Skeleton } from '@/components/ui/skeleton'
import { match, P } from 'ts-pattern'
import { env } from '@/env.mjs'
import { CopyIcon, Forward } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import { getReferralLink } from 'common/util/referral'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import CardWithBeams from '@/components/card-with-beams'

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
      className={`flex-none p-2 rounded-full text-xs bg-green-200 text-green-800 item-center text-center`}
    >
      +{credits} credits
    </span>
  )
}

const ReferralsPage = () => {
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
    return CardWithBeams({
      title: 'Uh-oh, spaghettio!',
      description: "We couldn't fetch your referral data.",
      content: (
        <>
          <p>
            Something went wrong. Please reach out to{' '}
            {env.NEXT_PUBLIC_SUPPORT_EMAIL} for help, and send the following
            error:
          </p>
          <code>{error.message}</code>
        </>
      ),
    })
  }

  if (status === 'unauthenticated') {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>You&apos;re not logged in.</CardTitle>
          <CardDescription>No code for you!</CardDescription>
        </CardHeader>
        <CardContent>Log in to get your unique referral code</CardContent>
        <SignInCardFooter />
      </Card>
    )
  }

  return (
    <div className="flex flex-col space-y-6">
      {data?.referredBy && (
        <Card className="bg-green-100 dark:bg-green-900">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Forward className="mr-2" /> You claimed a referral bonus. You
              rock! 🤘
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            <div className="flex place-content-between">
              <div className="text-sm flex items-center">
                <Button variant="link" className="p-0 mr-1 h-auto" asChild>
                  <Link href={`mailto:${data.referredBy.email}`}>
                    <span className="text-sm">{data.referredBy.name}</span>
                  </Link>
                </Button>
                <p>referred you. </p>
              </div>
              {CreditsBadge(CREDITS_REFERRAL_BONUS)}
            </div>
          </CardContent>
        </Card>
      )}
      <Card className="bg-sky-100 dark:bg-sky-900 ">
        <CardHeader>
          <CardTitle>Your Referrals</CardTitle>
          <CardDescription>
            Refer a friend and <b>you&apos;ll both</b> earn{' '}
            {CREDITS_REFERRAL_BONUS} credits per month!{' '}
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
              )
            )
            .with(
              {
                loading: false,
                data: P.not(undefined),
              },
              ({ data }) => (
                <CardContent>
                  <div className="flex flex-col space-y-4">
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
                      You&apos;ve referred{' '}
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
                            {CreditsBadge(CREDITS_REFERRAL_BONUS)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </CardContent>
              )
            )
            .otherwise(() => (
              <p>
                Uh-oh, something went wrong. Try again or reach out to{' '}
                {env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.
              </p>
            ))}
        </CardContent>
      </Card>
    </div>
  )
}

export default ReferralsPage
