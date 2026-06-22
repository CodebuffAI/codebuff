'use client'

import { useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useEffect, useRef, useState } from 'react'
import { api } from '@/convex/_generated/api'
import { toast } from 'sonner'
import {
  getReferralCodeFromCookie,
  clearReferralCookie,
} from '@/app/web/actions/referral'

export function useSignedInUser() {
  const { isLoading, isAuthenticated } = useConvexAuth()
  const [referralCode, setReferralCode] = useState<string | undefined>()
  const [referralCodeLoaded, setReferralCodeLoaded] = useState(false)
  const hasAttemptedUserLink = useRef(false)

  // When this state is set we know the server
  // has stored the user.
  const user = useQuery(api.users.viewer)
  const createUser = useMutation(api.users.getOrCreateSignedInUser)
  const syncReferralCount = useMutation(api.users.syncQualifiedReferralCount)

  useEffect(() => {
    // Get referral code from cookie on mount
    getReferralCodeFromCookie()
      .then((code) => {
        if (code) {
          setReferralCode(code)
        }
      })
      .finally(() => setReferralCodeLoaded(true))
  }, [])

  useEffect(() => {
    // Wait for Convex auth and the referral-cookie fetch to finish loading,
    // otherwise user creation can race ahead and drop the referral code.
    if (isLoading || user === undefined || !referralCodeLoaded) {
      return
    }

    if (!isAuthenticated) {
      // user not logged in with Convex
      return
    }

    const needsUserLink = user === null || !(user as any)?.freebuff_user_id

    if (needsUserLink && !hasAttemptedUserLink.current) {
      hasAttemptedUserLink.current = true
      // User is authenticated with Convex but either not found in Convex DB,
      // or found by legacy email without a Freebuff id. Create or link it.
      const attemptCreateUser = async (retryCount = 0) => {
        try {
          // Only pass referralCode if it exists
          await createUser(referralCode ? { referralCode } : {})
          // Clear the referral cookie after successful user creation
          if (referralCode) {
            await clearReferralCookie()
          }
        } catch (error) {
          console.error('Failed to create user:', error)
          const errorMessage =
            error instanceof Error ? error.message : String(error)

          if (
            errorMessage
              .toLowerCase()
              .includes('an account with this email already exists')
          ) {
            toast.error('This email already has an account. Please sign in.')
            return
          }

          if (retryCount < 2) {
            // Retry logic to handle temporary auth sync issues
            setTimeout(() => {
              if (!user || !(user as any)?.freebuff_user_id) {
                attemptCreateUser(retryCount + 1)
              }
            }, 1000)
          } else {
            // After retries exhausted, ask user to refresh
            toast.error('Authentication failed, please refresh the page')
          }
        }
      }
      attemptCreateUser()
    }
  }, [
    user,
    isAuthenticated,
    createUser,
    isLoading,
    referralCode,
    referralCodeLoaded,
  ])

  useEffect(() => {
    if (isLoading || !isAuthenticated || user === undefined || user === null) {
      return
    }
    void syncReferralCount({})
  }, [isLoading, isAuthenticated, user?._id, syncReferralCount])

  return user
}
