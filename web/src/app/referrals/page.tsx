'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from '@/components/ui/use-toast'
import * as schema from 'common/db/schema'

const ReferralsPage = () => {
  const { data: session } = useSession()
  const [referralCode, setReferralCode] = useState('')
  const [referrals, setReferrals] = useState<
    Array<typeof schema.referral.$inferSelect>
  >([])

  useEffect(() => {
    if (session?.user) {
      // Fetch user's referral code and referrals
      // This is a placeholder and should be replaced with actual API call
      setReferralCode('EXAMPLE123')
      setReferrals([
        { id: 1, email: 'friend@example.com', status: 'pending' },
        { id: 2, email: 'colleague@example.com', status: 'completed' },
      ])
    }
  }, [session])

  const copyReferralCode = () => {
    navigator.clipboard.writeText(referralCode)
    toast({
      title: 'Copied!',
      description: 'Referral code copied to clipboard',
    })
  }

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
              value={referralCode}
              readOnly
              className="bg-gray-100 dark:bg-gray-800"
            />
            <Button onClick={copyReferralCode}>Copy</Button>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Your Referrals</CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length > 0 ? (
            <ul className="space-y-2">
              {referrals.map((referral) => (
                <li
                  key={referral.id}
                  className="flex justify-between items-center"
                >
                  <span>{referral.email}</span>
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
