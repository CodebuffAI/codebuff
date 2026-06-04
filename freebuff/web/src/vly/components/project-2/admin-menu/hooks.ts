import { useState, useEffect } from "react";
import { useAction, useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";
import { UserInfo } from "./types";
import { Id } from "@/convex/_generated/dataModel";

export function useUserSearch(debouncedSearchQuery: string) {
  return useQuery(
    api.admin.searchUsersByEmail,
    debouncedSearchQuery.length > 0
      ? { searchQuery: debouncedSearchQuery }
      : "skip",
  );
}

export function useCreditManagement(selectedUser: UserInfo | null) {
  const [creditBalances, setCreditBalances] = useState<any>(null);
  const [loadingCreditBalances, setLoadingCreditBalances] = useState(false);
  const getUserCreditBalances = useAction(api.admin.getUserCreditBalances);
  const grantCredits = useAction(api.admin.grantCreditsToUser);

  useEffect(() => {
    if (selectedUser) {
      setLoadingCreditBalances(true);
      getUserCreditBalances({ clerkId: selectedUser.clerk_id })
        .then((data) => setCreditBalances(data))
        .catch((err) => {
          console.error("Failed to load credit balances:", err);
          toast.error("Failed to load credit balances");
        })
        .finally(() => setLoadingCreditBalances(false));
    } else {
      setCreditBalances(null);
    }
  }, [selectedUser]);

  const refreshBalances = async () => {
    if (selectedUser) {
      try {
        const data = await getUserCreditBalances({
          clerkId: selectedUser.clerk_id,
        });
        setCreditBalances(data);
      } catch (err) {
        console.error("Failed to refresh credit balances:", err);
      }
    }
  };

  return {
    creditBalances,
    loadingCreditBalances,
    grantCredits,
    refreshBalances,
  };
}

export function usePauseManagement() {
  const [isPausing, setIsPausing] = useState(false);
  const [pauseResults, setPauseResults] = useState<any>(null);

  const pauseUserDeployments = useAction(api.admin.pauseUserDeployments);
  const unpauseUserDeployments = useAction(api.admin.unpauseUserDeployments);
  const pauseProjectDeployment = useAction(api.admin.pauseProjectDeployment);
  const unpauseProjectDeployment = useAction(
    api.admin.unpauseProjectDeployment,
  );

  const handlePauseUser = async (
    user: UserInfo,
    pauseStatus: any,
    pauseReason: string,
    autoUnpause: boolean,
  ) => {
    setIsPausing(true);
    setPauseResults(null);

    try {
      if (pauseStatus?.active) {
        const result = await unpauseUserDeployments({ userId: user._id });
        setPauseResults(result);
        toast.success(
          `Successfully unpaused all deployments for ${user.email}`,
        );
      } else {
        const result = await pauseUserDeployments({
          userId: user._id,
          pauseReason: pauseReason as any,
          autoUnpauseEnabled: autoUnpause,
        });
        setPauseResults(result);
        toast.success(`Successfully paused all deployments for ${user.email}`);
      }
    } catch (error) {
      console.error("Failed to pause/unpause user deployments:", error);
      toast.error(
        `Failed to ${pauseStatus?.active ? "unpause" : "pause"} deployments: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsPausing(false);
    }
  };

  const handlePauseProject = async (
    projectId: Id<"project">,
    pauseStatus: any,
    pauseReason: string,
  ) => {
    setIsPausing(true);
    setPauseResults(null);

    try {
      if (pauseStatus?.active) {
        const result = await unpauseProjectDeployment({ projectId });
        setPauseResults(result);
        toast.success(`Successfully unpaused this project's deployments`);
      } else {
        const result = await pauseProjectDeployment({
          projectId,
          pauseReason: pauseReason as any,
        });
        setPauseResults(result);
        toast.success(`Successfully paused this project's deployments`);
      }
    } catch (error) {
      console.error("Failed to pause/unpause project deployments:", error);
      toast.error(
        `Failed to ${pauseStatus?.active ? "unpause" : "pause"} project deployments: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    } finally {
      setIsPausing(false);
    }
  };

  return {
    isPausing,
    pauseResults,
    handlePauseUser,
    handlePauseProject,
  };
}

export function useFeatureFlags() {
  const [togglingFlag, setTogglingFlag] = useState<string | null>(null);
  const [flagPercentages, setFlagPercentages] = useState<
    Record<string, number>
  >({});
  const setFlag = useMutation(api.featureFlags.setFlag);

  const handleUpdateFlag = async (
    key: string,
    strategy: string,
    percentage?: number,
  ) => {
    setTogglingFlag(key);
    try {
      await setFlag({
        key,
        rollout_strategy: strategy as any,
        rollout_percentage: strategy === "percentage" ? percentage : undefined,
      });
      toast.success(
        `${key} updated to ${strategy}${strategy === "percentage" ? ` (${percentage}%)` : ""}`,
      );
    } catch (error) {
      toast.error(
        `Failed to update flag: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setTogglingFlag(null);
    }
  };

  return {
    togglingFlag,
    flagPercentages,
    setFlagPercentages,
    handleUpdateFlag,
  };
}
