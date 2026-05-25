"use client";

import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import {
  getReferralCodeFromCookie,
  clearReferralCookie,
} from "@/app/actions/referral";

export function useSignedInUser() {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const [referralCode, setReferralCode] = useState<string | undefined>();

  // When this state is set we know the server
  // has stored the user.
  const user = useQuery(api.users.viewer);
  const createUser = useMutation(api.users.getOrCreateSignedInUser);

  useEffect(() => {
    // Get referral code from cookie on mount
    getReferralCodeFromCookie().then((code) => {
      if (code) {
        setReferralCode(code);
      }
    });
  }, []);

  useEffect(() => {
    // Wait for Convex auth to finish loading
    if (isLoading || user === undefined) {
      // still loading - Convex auth or query is not ready
      return;
    }

    if (!isAuthenticated) {
      // user not logged in with Convex
      return;
    }

    if (user === null) {
      // User is authenticated with Convex but not found in Convex DB
      // Create a new user record
      const attemptCreateUser = async (retryCount = 0) => {
        try {
          // Only pass referralCode if it exists
          await createUser(referralCode ? { referralCode } : {});
          // Clear the referral cookie after successful user creation
          if (referralCode) {
            await clearReferralCookie();
          }
        } catch (error) {
          console.error("Failed to create user:", error);
          const errorMessage =
            error instanceof Error ? error.message : String(error);

          if (
            errorMessage
              .toLowerCase()
              .includes("an account with this email already exists")
          ) {
            toast.error("This email already has an account. Please sign in.");
            return;
          }

          if (retryCount < 2) {
            // Retry logic to handle temporary auth sync issues
            setTimeout(() => {
              if (!user) {
                attemptCreateUser(retryCount + 1);
              }
            }, 1000);
          } else {
            // After retries exhausted, ask user to refresh
            toast.error("Authentication failed, please refresh the page");
          }
        }
      };
      attemptCreateUser();
    }
  }, [user, isAuthenticated, createUser, isLoading, referralCode]);

  return user;
}
