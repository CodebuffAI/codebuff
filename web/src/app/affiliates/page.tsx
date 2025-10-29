'use client'

import {
  CREDITS_REFERRAL_BONUS,
  AFFILIATE_USER_REFFERAL_LIMIT,
} from '@codebuff/common/old-constants'
import { env } from '@codebuff/internal'
import Link from 'next/link'
import { useSession } from 'next-auth/react'
import React, { useEffect, useState, useCallback } from 'react'
import { useFormState, useFormStatus } from 'react-dom'

import { setAffiliateHandleAction } from './actions'

import type { SetHandleFormState } from './actions'

import CardWithBeams from '@/components/card-with-beams'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/components/ui/use-toast'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Setting Handle...' : 'Set Handle'}
    </Button>
  )
}

function SetHandleForm({
  onHandleSetSuccess,
}: {
  onHandleSetSuccess: () => void
}) {
  const { toast } = useToast()
  const initialState: SetHandleFormState = {
    message: '',
    success: false,
    fieldErrors: {},
  }
  const [state, formAction] = useFormState(
    setAffiliateHandleAction,
    initialState,
  )

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? 'Success!' : 'Error',
        description: state.message,
        variant: state.success ? 'default' : 'destructive',
      })
      if (state.success) {
        onHandleSetSuccess()
      }
    }
  }, [state, toast, onHandleSetSuccess])

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="handle">Set Your Affiliate Handle</Label>
        <p className="text-sm text-muted-foreground mt-1">
          This will be part of your referral link (e.g.,
          codebuff.com/your_unique_handle).
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          3-20 chars. letters, numbers, underscores only.
        </p>
        <Input
          id="handle"
          name="handle"
          type="text"
          required
          minLength={3}
          maxLength={20}
          pattern="^[a-zA-Z0-9_]+$"
          placeholder="your_unique_handle"
          aria-describedby="handle-error"
          className="mt-1"
        />

        {state.fieldErrors?.handle && (
          <p id="handle-error" className="text-sm text-red-600 mt-1">
            {state.fieldErrors.handle.join(', ')}
          </p>
        )}
        {!state.success && state.message && !state.fieldErrors?.handle && (
          <p className="text-sm text-red-600 mt-1">{state.message}</p>
        )}
      </div>
      <SubmitButton />
    </form>
  )
}

export default function AffiliatesPage() {
  const { status: sessionStatus } = useSession()
  const [userProfile, setUserProfile] = useState<
    { handle: string | null; referralCode: string | null } | undefined
  >(undefined)
  const [fetchError, setFetchError] = useState<string | null>(null)

  const fetchUserProfile = useCallback(() => {
    setFetchError(null)
    fetch('/api/user/profile')
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}))
          throw new Error(
            errorData.error || `HTTP error! status: ${res.status}`,
          )
        }
        return res.json()
      })
      .then((data) => {
        setUserProfile({
          handle: data.handle ?? null,
          referralCode: data.referral_code ?? null,
        })
      })
      .catch((error) => {
        console.error('Failed to fetch user profile:', error)
        setFetchError(error.message || 'Failed to load profile data.')
        setUserProfile({ handle: null, referralCode: null })
      })
  }, [])

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetchUserProfile()
    } else if (sessionStatus === 'unauthenticated') {
      setUserProfile({ handle: null, referralCode: null })
    }
  }, [sessionStatus, fetchUserProfile])

  if (sessionStatus === 'loading' || userProfile === undefined) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <Card>
            <CardHeader>
              <Skeleton className="h-8 w-1/2 mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </CardHeader>
            <CardContent className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-20 w-full" />
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  if (sessionStatus === 'unauthenticated') {
    return (
      <CardWithBeams
        title="Join Our Affiliate Program"
        description="Log in to access the affiliate sign-up form."
        content={
          <>
            <p className="text-center mb-4">
              Want to partner with Codebuff and earn rewards? Log in first!
            </p>
            <SignInCardFooter />
          </>
        }
      />
    )
  }

  if (fetchError) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto text-center text-red-600">
          <p>Error loading affiliate information: {fetchError}</p>
          <p>Please try refreshing the page or contact support.</p>
        </div>
      </div>
    )
  }

  const userHandle = userProfile?.handle
  const referralCode = userProfile?.referralCode

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <Card>
          <CardHeader>
            <CardTitle className="text-3xl font-bold">
              Codebuff Affiliate Program
            </CardTitle>
            <CardDescription className="text-lg text-muted-foreground">
              Share Codebuff and earn credits!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {userHandle === null && (
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  Become an Affiliate
                </h2>
                <p className="pb-8">
                  Generate your unique referral link, that grants you{' '}
                  {AFFILIATE_USER_REFFERAL_LIMIT.toLocaleString()} referrals for
                  your friends, colleagues, and followers. When they sign up
                  using your link, you'll both earn an extra{' '}
                  {CREDITS_REFERRAL_BONUS} credits!
                </p>

                <SetHandleForm onHandleSetSuccess={fetchUserProfile} />
              </div>
            )}

            {userHandle && (
              <div>
                <h2 className="text-xl font-semibold mb-2">
                  Your Affiliate Handle
                </h2>
                <p>
                  Your affiliate handle is set to:{' '}
                  <code className="font-mono bg-muted px-1 py-0.5 rounded">
                    {userHandle}
                  </code>
                  . You can now refer up to{' '}
                  {AFFILIATE_USER_REFFERAL_LIMIT.toLocaleString()} new users!
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your referral link is:{' '}
                  <Link
                    href={`/${userHandle}`}
                    className="underline"
                  >{`${env.NEXT_PUBLIC_CODEBUFF_APP_URL}/${userHandle}`}</Link>
                </p>
              </div>
            )}

            <p className="text-sm text-muted-foreground border-t pt-4 mt-6">
              Questions? Contact us at{' '}
              <Link
                href={`mailto:${env.NEXT_PUBLIC_SUPPORT_EMAIL}`}
                className="underline"
              >
                {env.NEXT_PUBLIC_SUPPORT_EMAIL}
              </Link>
              .
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
