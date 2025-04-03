'use client'

import { useSession } from 'next-auth/react'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import CardWithBeams from '@/components/card-with-beams'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { env } from '@/env.mjs'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useFormState, useFormStatus } from 'react-dom'
import { setAffiliateHandleAction, SetHandleFormState } from './actions'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useToast } from '@/components/ui/use-toast'

function SubmitButton() {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending}>
      {pending ? 'Setting Handle...' : 'Set Handle & Become Affiliate'}
    </Button>
  )
}

function SetHandleForm() {
  const { toast } = useToast()
  const initialState: SetHandleFormState = {
    message: '',
    success: false,
    fieldErrors: {},
  }
  const [state, formAction] = useFormState(setAffiliateHandleAction, initialState)

  useEffect(() => {
    if (state.message) {
      toast({
        title: state.success ? 'Success!' : 'Error',
        description: state.message,
        variant: state.success ? 'default' : 'destructive',
      })
    }
  }, [state, toast])

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <Label htmlFor="handle">Choose Your Affiliate Handle</Label>
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
        <p className="text-sm text-muted-foreground mt-1">
          This will be part of your referral link (e.g., codebuff.com/your_unique_handle). Choose wisely! (3-20 chars, letters, numbers, underscores only).
        </p>
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
  const { data: session, status: sessionStatus } = useSession()
  const [userProfile, setUserProfile] = useState<{ handle: string | null, referralCode: string | null } | undefined>(undefined)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (sessionStatus === 'authenticated') {
      fetch('/api/user/profile')
        .then(async (res) => {
          if (!res.ok) {
            const errorData = await res.json().catch(() => ({}))
            throw new Error(errorData.error || `HTTP error! status: ${res.status}`)
          }
          return res.json()
        })
        .then((data) => {
          setUserProfile({
             handle: data.handle ?? null,
             referralCode: data.referralCode ?? null
          })
        })
        .catch((error) => {
          console.error('Failed to fetch user profile:', error)
          setFetchError(error.message || 'Failed to load profile data.')
          setUserProfile({ handle: null, referralCode: null })
        })
    } else if (sessionStatus === 'unauthenticated') {
      setUserProfile({ handle: null, referralCode: null })
    }
  }, [sessionStatus])

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
              Partner with us, share Codebuff, and earn rewards!
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2">How it Works</h2>
              <p>
                Join our affiliate program to get your unique referral link.
                Share it with your audience, friends, or colleagues. When they
                sign up using your link, you'll earn increased referral limits, allowing you to bring more users to Codebuff!
              </p>
            </div>

            {userHandle === null && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Become an Affiliate</h2>
                <p className="mb-4">
                  Choose a unique handle below. This handle will be used in your
                  personal referral links (e.g., `codebuff.ai/{userHandle}`). Setting a handle will upgrade your account to affiliate status with increased referral limits.
                </p>
                <SetHandleForm />
              </div>
            )}

            {userHandle && referralCode && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Your Affiliate Handle</h2>
                <p>
                  Your affiliate handle is set to: <code className="font-mono bg-muted px-1 py-0.5 rounded">{userHandle}</code>
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Your referral link is: <Link href={`/referrals/${referralCode}?referrer=${userHandle}`} className="underline">{`${env.NEXT_PUBLIC_APP_URL}/${userHandle}`}</Link>
                </p>
                <p className="mt-2">You can now refer more users!</p>
              </div>
            )}

            {userHandle && !referralCode && (
              <div>
                <h2 className="text-xl font-semibold mb-2">Your Affiliate Handle</h2>
                <p>Your affiliate handle is set to: <code className="font-mono bg-muted px-1 py-0.5 rounded">{userHandle}</code></p>
                <p className="text-sm text-red-500 mt-1">Could not load your referral code. Please contact support.</p>
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