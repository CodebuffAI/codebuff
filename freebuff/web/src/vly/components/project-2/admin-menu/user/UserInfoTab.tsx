"use client";

import { User, Activity } from "lucide-react";
import { Badge } from "@/vly/components/ui/badge";
import { EmptyState } from "../shared";
import { formatDate } from "../utils";
import { UserInfo } from "../types";
import { useUserDetails } from "@/vly/hooks/useUserDetails";

interface UserInfoTabProps {
  selectedUser: UserInfo | null;
}

export function UserInfoTab({ selectedUser }: UserInfoTabProps) {
  // Fetch user details using React Query (Suspense)
  // Must call hook before any conditional returns (Rules of Hooks)
  const { data: userDetailsData } = useUserDetails(selectedUser?._id);

  if (!selectedUser) {
    return (
      <EmptyState icon={User} title="Please select a user to view details" />
    );
  }

  const resolvedTier =
    userDetailsData.subscription?.tier || userDetailsData.user.tier || "free";
  const resolvedPlanName =
    userDetailsData.subscription?.planName ||
    resolvedTier.charAt(0).toUpperCase() + resolvedTier.slice(1);
  const isPaidTier = resolvedTier !== "free";

  return (
    <div className="space-y-4">
      {/* User Info */}
      <div className="rounded-lg border border-zinc-200 bg-gradient-to-br from-white to-zinc-50/30 p-5 shadow-sm">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <div className="flex h-6 w-6 items-center justify-center rounded bg-blue-50">
            <User className="h-3.5 w-3.5 text-blue-600" />
          </div>
          User Information
        </h3>
        <div className="space-y-3 text-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="font-medium text-zinc-600">Name</span>
            <span className="font-semibold text-zinc-900">
              {userDetailsData.user.name}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="font-medium text-zinc-600">Email</span>
            <span className="font-mono text-xs text-zinc-900">
              {userDetailsData.user.email}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="font-medium text-zinc-600">Role</span>
            <Badge variant="secondary" className="font-medium">
              {userDetailsData.user.role || "member"}
            </Badge>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="font-medium text-zinc-600">Tier</span>
            <Badge
              variant={isPaidTier ? "default" : "secondary"}
              className={isPaidTier ? "bg-blue-500 hover:bg-blue-600" : ""}
            >
              {resolvedTier}
            </Badge>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="font-medium text-zinc-600">Plan</span>
            <span className="font-semibold text-zinc-900">
              {resolvedPlanName}
            </span>
          </div>
          <div className="flex items-center justify-between border-b border-zinc-100 py-2">
            <span className="font-medium text-zinc-600">Billing Source</span>
            <Badge variant="outline" className="text-[10px]">
              {userDetailsData.subscription?.source === "autumn"
                ? "Autumn (live)"
                : "DB fallback"}
            </Badge>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="font-medium text-zinc-600">Created</span>
            <span className="text-xs text-zinc-900">
              {formatDate(userDetailsData.user._creationTime)}
            </span>
          </div>
        </div>
      </div>

      {/* TODO: Add subscription and usage stats when Autumn integration is complete */}
      <EmptyState
        icon={Activity}
        title="Subscription and usage stats coming soon"
      />
    </div>
  );
}
