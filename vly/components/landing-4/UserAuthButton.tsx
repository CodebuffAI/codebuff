import React, { useState } from "react";
import {
  useUser,
  useClerk,
  useOrganizationList,
  useOrganization,
} from "@clerk/nextjs";
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from "@/components/auth/AuthComponents";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Beaker, Loader2 } from "lucide-react";
import { useFeatureFlag } from "@/hooks/useFeatureFlag";
import { useSignedInUser } from "@/hooks/use-user";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { toast } from "sonner";

interface UserAuthButtonProps {
  mounted: boolean;
}

export default function UserAuthButton({ mounted }: UserAuthButtonProps) {
  const { user, isLoaded } = useUser();
  const convexUser = useSignedInUser();
  const toggleBeta = useMutation(api.featureFlags.toggleUserBeta);
  const [isTogglingBeta, setIsTogglingBeta] = useState(false);

  // Check if organizations feature is enabled
  const { enabled: organizationsEnabled } = useFeatureFlag(
    "organizations_enabled",
  );
  const {
    signOut,
    openUserProfile,
    openCreateOrganization,
    openOrganizationProfile,
  } = useClerk();
  const {
    userMemberships,
    setActive,
    isLoaded: orgListLoaded,
  } = useOrganizationList({
    userMemberships: {
      infinite: true,
    },
  });
  const { organization: currentOrg } = useOrganization();

  const handleBetaToggle = async () => {
    if (!convexUser?._id) return;

    setIsTogglingBeta(true);
    try {
      const newBetaStatus = !convexUser.is_beta;
      await toggleBeta({
        userId: convexUser._id,
        isBeta: newBetaStatus,
      });
      toast.success(
        newBetaStatus ? "Beta features enabled" : "Beta features disabled",
      );
    } catch (error) {
      toast.error(
        `Failed to toggle beta: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setIsTogglingBeta(false);
    }
  };

  if (!mounted || !isLoaded) {
    return <div className="h-9 w-9 animate-pulse rounded-full bg-gray-200" />;
  }

  return (
    <>
      <SignedIn>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              id="user-btn"
              className="group relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-full transition-all duration-300 hover:scale-105 focus:outline-none"
              aria-label="User menu"
            >
              <Avatar className="relative z-10 h-9 w-9">
                <AvatarImage
                  src={
                    organizationsEnabled && currentOrg
                      ? currentOrg.imageUrl
                      : user?.imageUrl
                  }
                  alt={
                    organizationsEnabled && currentOrg
                      ? currentOrg.name
                      : user?.fullName || "User"
                  }
                />
                <AvatarFallback
                  className={
                    organizationsEnabled && currentOrg
                      ? "bg-blue-100 text-blue-700"
                      : ""
                  }
                >
                  {organizationsEnabled && currentOrg
                    ? currentOrg.name.charAt(0)
                    : user?.fullName?.charAt(0) || "U"}
                </AvatarFallback>
              </Avatar>

              {/* Organization indicator - positioned outside the avatar */}
              {organizationsEnabled && currentOrg && (
                <div className="absolute bottom-0 right-0 z-20 h-3 w-3 rounded-full bg-blue-500 ring-2 ring-white"></div>
              )}

              <div className="pointer-events-none absolute inset-y-0 -left-full z-20 w-[300%] -translate-x-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent transition-transform duration-1000 ease-out group-hover:translate-x-1/3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="z-[10001] w-64 rounded-lg border border-gray-200 bg-white p-0 shadow-lg"
            align="end"
          >
            {/* User Profile Section - Clickable to cycle contexts */}
            <div className="border-b border-gray-100">
              <button
                className="w-full p-4 text-left transition-colors hover:bg-gray-50"
                disabled={!organizationsEnabled}
                onClick={() => {
                  if (
                    organizationsEnabled &&
                    userMemberships?.data &&
                    userMemberships.data.length > 0
                  ) {
                    const allContexts = [
                      null,
                      ...userMemberships.data.map((m) => m.organization.id),
                    ];
                    const currentIndex = currentOrg
                      ? allContexts.findIndex((id) => id === currentOrg.id)
                      : 0;
                    const nextIndex = (currentIndex + 1) % allContexts.length;
                    const nextOrgId = allContexts[nextIndex];

                    if (setActive) {
                      setActive({ organization: nextOrgId });
                    }
                  }
                }}
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage
                      src={
                        organizationsEnabled && currentOrg
                          ? currentOrg.imageUrl
                          : user?.imageUrl
                      }
                      alt={
                        organizationsEnabled && currentOrg
                          ? currentOrg.name
                          : user?.fullName || "User"
                      }
                    />
                    <AvatarFallback
                      className={
                        organizationsEnabled && currentOrg
                          ? "bg-blue-100 text-blue-700"
                          : ""
                      }
                    >
                      {organizationsEnabled && currentOrg
                        ? currentOrg.name.charAt(0)
                        : user?.fullName?.charAt(0) || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-900">
                      {organizationsEnabled && currentOrg
                        ? currentOrg.name
                        : user?.fullName || "User"}
                    </p>
                    <p className="truncate text-sm text-gray-500">
                      {organizationsEnabled && currentOrg
                        ? "Organization"
                        : user?.primaryEmailAddress?.emailAddress}
                    </p>
                    {organizationsEnabled &&
                      userMemberships?.data &&
                      userMemberships.data.length > 0 && (
                        <p className="mt-1 truncate text-xs text-blue-600">
                          Click to switch context
                        </p>
                      )}
                  </div>
                  {organizationsEnabled && currentOrg && (
                    <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                  )}
                </div>
              </button>
            </div>

            {/* Quick Actions */}
            {organizationsEnabled && (
              <div className="border-b border-gray-100 p-2">
                <DropdownMenuItem
                  className="cursor-pointer px-4 py-2 text-sm !text-blue-600 hover:!bg-blue-50 hover:!text-blue-700 data-[highlighted]:!bg-blue-50 data-[highlighted]:!text-blue-700"
                  onClick={() => openCreateOrganization()}
                >
                  + Create organization
                </DropdownMenuItem>
              </div>
            )}

            {/* Menu Items */}
            <div className="py-1">
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                onClick={() => openUserProfile()}
              >
                Manage account
              </DropdownMenuItem>
              {organizationsEnabled && currentOrg && (
                <DropdownMenuItem
                  className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                  onClick={() => openOrganizationProfile()}
                >
                  Manage organization
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 !text-gray-600 hover:!bg-gray-100 data-[highlighted]:!bg-gray-100"
                onSelect={(e) => {
                  e.preventDefault();
                  handleBetaToggle();
                }}
              >
                <div className="flex w-full items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Beaker className="h-4 w-4" />
                    <span className="text-sm">Beta Features</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {isTogglingBeta && (
                      <Loader2 className="h-3 w-3 animate-spin text-gray-500" />
                    )}
                    <Switch
                      checked={convexUser?.is_beta || false}
                      disabled={isTogglingBeta}
                      onCheckedChange={handleBetaToggle}
                      onClick={(e) => e.stopPropagation()}
                      className="data-[state=checked]:bg-blue-600"
                    />
                  </div>
                </div>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900 data-[highlighted]:!bg-gray-100 data-[highlighted]:!text-gray-900"
                onClick={() => signOut()}
              >
                Sign out
              </DropdownMenuItem>
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal" asChild>
          <button
            className="flex h-7 w-24 cursor-pointer items-center justify-center rounded-[90px] bg-[#CCB8DA] font-semibold text-white transition-colors hover:bg-[#bfa0d6]"
            style={{ fontSize: 16 }}
          >
            Sign In
          </button>
        </SignInButton>
      </SignedOut>
    </>
  );
}
