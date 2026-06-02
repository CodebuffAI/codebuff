import { useSuspenseQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface UserDetails {
  user: {
    _id: string;
    name: string;
    email: string;
    role?: string;
    tier?: string;
    _creationTime: number;
  };
  subscription?: {
    tier?: string;
    planId?: string | null;
    planName?: string | null;
    source?: "autumn" | "database_fallback";
  } | null;
}

/**
 * Hook to fetch user details using React Query.
 * Uses Suspense for loading states.
 */
export function useUserDetails(userId: Id<"users"> | undefined) {
  const getUserDetails = useAction(api.admin.getUserDetails);

  return useSuspenseQuery({
    queryKey: ["userDetails", userId],
    queryFn: async (): Promise<UserDetails> => {
      if (!userId) throw new Error("No user ID provided");
      return await getUserDetails({ userId });
    },
    // Cache for 1 minute to avoid refetching when switching tabs
    staleTime: 60000,
  });
}
