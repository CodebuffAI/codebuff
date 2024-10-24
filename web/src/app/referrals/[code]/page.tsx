'use client'

import { useSession } from 'next-auth/react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { sleep } from 'common/util/helpers'
import { CopyIcon, CheckIcon, GiftIcon } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import type { ReferralCodeResponse } from '@/app/api/referrals/[code]/route'
import { Button } from '@/components/ui/button'

const InputWithCopyButton = ({ text }: { text: string }) => {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (copied) {
      navigator.clipboard.writeText(text)
      sleep(3000).then(() => {
        setCopied(false)
      })
    }
  }, [copied])

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

export default function RedeemPage({ params }: { params: { code: string } }) {
  const { data: session, status } = useSession()

  const { data } = useQuery({
    queryKey: ['referrals'],
    queryFn: async (): Promise<ReferralCodeResponse> => {
      const res = await fetch(`/api/referrals/${params.code}`)
      return res.json()
    },
  })

  if (status === 'loading') {
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

  return (
    <Card className="bg-violet-100 dark:bg-violet-900">
      <CardHeader>
        <CardTitle className="flex">
          <GiftIcon className="mr-2" />
          {data?.limitReached
            ? 'Referral Limit Reached'
            : "You've got credits!"}
        </CardTitle>
      </CardHeader>

      <CardContent>
        <b>Hey {session?.user?.name} 👋</b>
        {data && data?.limitReached ? (
          <p>
            Thanks for your interest, but {data.referrerName}&apos;s referral
            code has reached its maximum number of uses. Please ask another
            friend for their referral code or consider signing up directly.
          </p>
        ) : (
          <p>
            Your friend {data?.referrerName} just scored you some sweet sweet
            credits.
          </p>
        )}
      </CardContent>

      <div className="flex flex-col space-y-2">
        <CardContent>
          <p className="my-4">
            {data?.limitReached
              ? `Fear not, you can still get started with Manicode! Here's how:`
              : 'To redeem them, follow these steps:'}
          </p>
          <ol className="list-decimal list-inside space-y-6">
            <li>
              Install Manicode globally:
              <InputWithCopyButton text={'npm i -g manicode'} />
            </li>
            <li>
              Run Manicode in Terminal
              <InputWithCopyButton text={'manicode'} />
            </li>
            {!data?.limitReached && (
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
  )
}
