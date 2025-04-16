'use client'

import { useQuery } from '@tanstack/react-query'
import { sleep } from 'common/util/promise'
import { CheckIcon, CopyIcon, GiftIcon } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import posthog from 'posthog-js'
import { useEffect, useState } from 'react'

import type { ReferralCodeResponse } from '@/app/api/referrals/[code]/route'
import CardWithBeams from '@/components/card-with-beams'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { env } from '@/env.mjs'
import { storeSearchParams } from '@/lib/trackConversions'
import { Metadata } from 'next'

export const generateMetadata = async ({
  params,
}: {
  params: { code: string }
}): Promise<Metadata> => {
  return {
    title: 'Redeem Referral | Codebuff',
  }
}

const InputWithCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (copied) {
      navigator.clipboard.writeText(text)
      sleep(3000).then(() => {
        setCopied(false)
      })
    }
  }, [copied, text])

  return (
    <div className="relative my-2">
      <Input
        value={text}
        readOnly
        className="font-mono bg-gray-100 dark:bg-gray-800 pr-10 focus-visible:ring-0 focus-visible:ring-transparent focus-visible:ring-offset-0"
      />
      <Button
        onClick={() => setCopied(true)}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-auto"
        variant="ghost"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4 stroke-green-500" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}

export default function RedeemPage({
  params,
}: {
  params: { code: string }
}) {
  const code = params.code
  const { data: session, status } = useSession()
  const searchParams = useSearchParams()
  const referrerParam = searchParams.get('referrer')

  useEffect(() => {
    // Store the referral code if user is not logged in
    if (status === 'unauthenticated') {
      localStorage.setItem('referral_code', code)
    }
  }, [code, status])

  const { data, isLoading, error, isSuccess } = useQuery({
    queryKey: ['referrals', code],
    queryFn: async (): Promise<ReferralCodeResponse> => {
      const res = await fetch(`/api/referrals/${code}`)
      const ret = await res.json()
      if (!res.ok) {
        throw new Error(`Error fetching referral code: ${ret.error}`)
      }
      posthog.capture('referral.page_viewed', {
        code: code,
        referrer_name: ret.referrerName,
        is_sponsee: !!referrerParam,
        sponsee_name: referrerParam,
      })
      return ret
    },
    staleTime: Infinity,
  })

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  if (status === 'loading' || isLoading) {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Good news, just one sec...</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col space-y-4">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/6" />
          <Skeleton className="h-4 w-5/6" />
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return CardWithBeams({
      title: 'Uh-oh, spaghettio!',
      description: "We couldn't fetch this referral code.",
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

  return (
    <div className="flex flex-col space-y-6">
      <Card className="bg-violet-100 dark:bg-violet-900">
        <CardHeader>
          <CardTitle className="flex">
            <GiftIcon className="mr-2" />
            {data?.status.reason ? data.status.reason : "You've got credits!"}
          </CardTitle>
        </CardHeader>

        <CardContent>
          <b>Hey {session?.user?.name} 👋</b>
          {data?.status.reason && data.status.details?.msg ? (
            <p className="text-red-600 mt-2">{data.status.details.msg}</p>
          ) : (
            <p>
              {referrerParam || data?.referrerName} just scored you some
              sweet sweet credits.
            </p>
          )}
        </CardContent>

        <div className="flex flex-col space-y-2">
          <CardContent>
            <p className="my-4">
              {data?.status.reason
                ? `Fear not, you can still get started with Codebuff! Here's how:`
                : 'To redeem them, follow these steps:'}
            </p>
            <ol className="list-decimal list-inside space-y-6">
              <li>
                Install Codebuff globally:
                <InputWithCopyButton text={'npm install -g codebuff'} />
              </li>
              <li>
                Run Codebuff in Terminal
                <InputWithCopyButton text={'cd /my/project/dir && codebuff'} />
              </li>
              {!data?.status.reason && (
                <li>
                  Paste this referral code in the CLI.
                  <InputWithCopyButton text={params.code} />
                </li>
              )}
            </ol>
          </CardContent>
        </div>

        {data?.isSameUser && (
          <CardContent>
            <p className="font-bold text-red-600 mt-4">
              Just FYI, this is your own referral code. (Others won&apos;t see
              this message).
            </p>
          </CardContent>
        )}
      </Card>
      <Card className="bg-violet-100 dark:bg-blue-900">
        <CardHeader>
          <CardTitle className="flex">
            <h2 className="text-2xl font-bold">What is Codebuff?</h2>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <CardDescription>
            <div className="flex justify-between items-center">
              <p>
                Codebuff is a CLI tool that uses natural language to edit your
                codebase. Like a talented junior engineer who understands your
                repo&apos;s code structure and dependencies.
              </p>
            </div>
          </CardDescription>
          <div className="max-w-3xl mx-auto mt-4">
            <h3>Watch a demo</h3>
            <div className="aspect-w-16 aspect-h-full h-96">
              <iframe
                src="https://www.youtube.com/embed/dQ0NOMsu0dA"
                title="Codebuff Demo"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                className="h-full w-full rounded-lg shadow-lg"
              ></iframe>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
