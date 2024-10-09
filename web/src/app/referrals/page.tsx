'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import * as schema from 'common/db/schema'
import { ReferralData } from '../api/referrals/route'

const copyReferralCode = (code: string) => {
  navigator.clipboard.writeText(code)
  toast({
    title: 'Copied!',
    description: 'Referral code copied to clipboard',
  })
}

const ReferralsPage = () => {
  const { data: session } = useSession()
  // const [referralCode, setReferralCode] = useState('')

  const { data, error, isLoading } = useQuery<ReferralData>({
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

  if (error) return <div>An error occurred: {error.message}</div>
  if (isLoading || !data) return <div>Loading...</div>

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">Your Referrals</h1>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your Referral Code</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            <Input
              value={data.referralCode}
              readOnly
              className="bg-gray-100 dark:bg-gray-800"
            />
            <Button onClick={() => copyReferralCode(data.referralCode)}>
              Copy
            </Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {data.referrals.length > 0 ? (
            <ul className="space-y-2">
              {data.referrals.map((referral) => (
                <li
                  key={`${referral.referrer_id}-${referral.referred_id}`}
                  className="flex justify-between items-center"
                >
                  <span>{referral.referred_id}</span>
                  <span
                    className={`px-2 py-1 rounded-full text-xs ${
                      referral.status === 'completed'
                        ? 'bg-green-200 text-green-800'
                        : 'bg-yellow-200 text-yellow-800'
                    }`}
                  >
                    {referral.status}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>You haven't referred anyone yet.</p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ReferralsPage
