import { useSuspenseQuery } from "@tanstack/react-query";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

interface CreditBalance {
  featureId: string;
  name: string;
  balance: number | "unlimited";
  unlimited: boolean;
}

interface CreditBalancesResponse {
  balances: CreditBalance[];
}

/**
 * Hook to fetch user credit balances using React Query.
 * Uses Suspense for loading states.
 */
export function useUserCreditBalances(clerkId: string | undefined) {
  const getUserCreditBalances = useAction(api.admin.getUserCreditBalances);

  return useSuspenseQuery({
    queryKey: ["userCreditBalances", clerkId],
    queryFn: async (): Promise<CreditBalancesResponse> => {
      if (!clerkId) throw new Error("No clerk ID provided");
      return await getUserCreditBalances({ clerkId });
    },
    // Cache for 30 seconds to avoid refetching when switching tabs
    staleTime: 30000,
  });
}
