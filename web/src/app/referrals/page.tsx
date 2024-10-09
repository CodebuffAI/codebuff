'use client'

import { useSession } from 'next-auth/react'
import { useQuery, useMutation } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import { ReferralData } from '../api/referrals/route'
import { Skeleton } from '@/components/ui/skeleton'
import { match, P } from 'ts-pattern'
import { env } from '@/env.mjs'
import { useState } from 'react'
import { GiftIcon, CopyIcon, Forward, Link as LinkIcon } from 'lucide-react'
import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'

const copyReferral = (code: string, toLink: boolean) => {
  navigator.clipboard.writeText(
    toLink ? `${env.NEXT_PUBLIC_APP_URL}/redeem?referral_code=${code}` : code
  )
  toast({
    title: `Copied referral ${toLink ? 'link' : 'code'}`,
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
  const [inputCode, setInputCode] = useState('')

  const { data, error, isLoading, refetch } = useQuery<ReferralData>({
    queryKey: ['referrals'],
    queryFn: async () => {
      const response = await fetch('/api/referrals')
      if (!response.ok) {
        throw new Error('Failed to fetch referral data')
      }
      return response.json()
    },
    enabled: !!session?.user,
  })

  const mutation = useMutation({
    mutationFn: async (code: string) => {
      const response = await fetch('/api/referrals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referralCode: code }),
      })
      if (!response.ok) {
        const responseJson = await response.json()

        throw new Error(responseJson.error ?? `Failed to apply referral code`)
      }
      return response.json()
    },
    onSuccess: () => {
      toast({
        title: 'Referral code applied',
        description: 'Your referral code has been successfully applied!',
      })
      setInputCode('')
      refetch()
    },
    onError: (error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const loading = isLoading || status === 'loading'

  if (error) {
    return (
      <Card className="mb-6">
        <div>An error occurred: {error.message}</div>
      </Card>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>You're not logged in.</CardTitle>
        </CardHeader>
        <CardContent>No referral code for you!</CardContent>
      </Card>
    )
  }

  return (
    <div className="flex flex-col space-y-6">
      <Card className="bg-green-50 dark:bg-green-900">
        {data?.referredBy ? (
          <>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Forward className="mr-2" /> You both rock! 🤘
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
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Forward className="mr-2" /> Enter A Referral Code
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center space-x-2">
                {loading ? (
                  <Skeleton className="h-4 w-full" />
                ) : (
                  <>
                    <Input
                      value={inputCode}
                      onChange={(e) => setInputCode(e.target.value)}
                      placeholder="Enter referral code"
                    />
                    <Button
                      onClick={() => mutation.mutate(inputCode)}
                      disabled={mutation.isPending || !inputCode}
                    >
                      Apply
                    </Button>
                  </>
                )}
              </div>
            </CardContent>
          </>
        )}
      </Card>
      <Card className="bg-blue-50 dark:bg-blue-900">
        <CardHeader>
          <CardTitle>Your Referrals</CardTitle>
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
                <div className="flex flex-col space-y-4">
                  {data.referrals.length === 0 ? (
                    <p>You haven't referred anyone yet.</p>
                  ) : (
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

                  <div className="flex flex-col space-y-2">
                    <Separator className="my-4" />
                    <div className="flex items-center space-x-2 font-bold">
                      <GiftIcon className="mr-2" /> Your Referral Code
                    </div>
                    <div className="relative">
                      {loading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : (
                        <Input
                          value={data?.referralCode}
                          placeholder={'Your referral code'}
                          readOnly
                          className="bg-gray-100 dark:bg-gray-800 pr-10"
                        />
                      )}
                      <Button
                        onClick={() =>
                          data && copyReferral(data.referralCode, false)
                        }
                        disabled={loading || !session?.user}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-auto"
                        variant="ghost"
                      >
                        <CopyIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-col space-y-2">
                    <Separator className="my-4" />
                    <div className="flex items-center space-x-2 font-bold">
                      <LinkIcon className="mr-2" /> Your Referral Link
                    </div>
                    <div className="relative">
                      {loading ? (
                        <Skeleton className="h-10 w-full" />
                      ) : (
                        <Input
                          value={`${env.NEXT_PUBLIC_APP_URL}/redeem?referral_code=${data?.referralCode}`}
                          placeholder={'Your referral link'}
                          readOnly
                          className="bg-gray-100 dark:bg-gray-800 pr-10"
                        />
                      )}
                      <Button
                        onClick={() =>
                          data && copyReferral(data.referralCode, true)
                        }
                        disabled={loading || !session?.user}
                        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-auto"
                        variant="ghost"
                      >
                        <CopyIcon className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
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
