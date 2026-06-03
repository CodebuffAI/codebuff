"use client";

import { Badge } from "@/vly/components/ui/badge";
import { cn } from "@/vly/lib/utils";
import { Star, Award, Crown } from "lucide-react";

/**
 * Community Badge Tier System:
 * - Free (tier 0): No badge
 * - Starter (tier 1): "Supporter" badge
 * - Hobby (tier 2): "VIP" badge
 * - Business (tier 3): "VIP+" badge
 * - Scale (tier 4): "MVP" badge
 * - Priority (tier 5): "MVP+" badge
 * - Ultra (tier 6): "MVP++" badge
 * - Max (tier 7): "MVP+++" badge
 * - Unlimited (tier 8): "MVP++++" badge
 * - Enterprise (tier 9): "MVP+++++" badge
 */

export type BadgeInfo = {
  label: string;
  colorClasses: string;
  icon: typeof Star | typeof Award | typeof Crown;
  priority: number; // Used for sorting (higher = better)
};

/**
 * Get badge info based on communityBadgeTier value
 */
export function getBadgeInfo(communityBadgeTier: number): BadgeInfo | null {
  if (communityBadgeTier <= 0) return null;

  switch (communityBadgeTier) {
    case 1: // Starter
      return {
        label: "Supporter",
        colorClasses: "bg-emerald-500/15 text-emerald-300 border-emerald-400/35",
        icon: Star,
        priority: 1,
      };
    case 2: // Hobby
      return {
        label: "VIP",
        colorClasses: "bg-primary/10 text-primary border-primary/35",
        icon: Award,
        priority: 2,
      };
    case 3: // Business
      return {
        label: "VIP+",
        colorClasses: "bg-primary/10 text-primary border-primary/35",
        icon: Award,
        priority: 3,
      };
    case 4: // Scale
      return {
        label: "MVP",
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: 4,
      };
    case 5: // Priority
      return {
        label: "MVP+",
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: 5,
      };
    case 6: // Ultra
      return {
        label: "MVP++",
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: 6,
      };
    case 7: // Max
      return {
        label: "MVP+++",
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: 7,
      };
    case 8: // Unlimited
      return {
        label: "MVP++++",
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: 8,
      };
    case 9: // Enterprise
      return {
        label: "MVP+++++",
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: 9,
      };
    default:
      // For any tier above 9, keep adding plus signs
      const plusCount = communityBadgeTier - 4;
      return {
        label: `MVP${"+++++".slice(0, Math.min(plusCount, 10))}`,
        colorClasses: "bg-amber-500/15 text-amber-300 border-amber-400/35",
        icon: Crown,
        priority: communityBadgeTier,
      };
  }
}

/**
 * Get badge label string from tier
 */
export function getBadgeLabel(communityBadgeTier: number): string | null {
  const info = getBadgeInfo(communityBadgeTier);
  return info?.label ?? null;
}

interface CommunityBadgeProps {
  communityBadgeTier: number;
  size?: "sm" | "md" | "lg";
  showIcon?: boolean;
  className?: string;
}

/**
 * Community Badge Component
 * Displays a badge based on the user's subscription tier
 */
export function CommunityBadge({
  communityBadgeTier,
  size = "sm",
  showIcon = true,
  className,
}: CommunityBadgeProps) {
  const badgeInfo = getBadgeInfo(communityBadgeTier);

  if (!badgeInfo) return null;

  const Icon = badgeInfo.icon;

  const sizeClasses = {
    sm: "text-[10px] px-1.5 py-0.5",
    md: "text-xs px-2 py-0.5",
    lg: "text-sm px-2.5 py-1",
  };

  const iconSizes = {
    sm: "h-2.5 w-2.5",
    md: "h-3 w-3",
    lg: "h-3.5 w-3.5",
  };

  return (
    <Badge
      variant="outline"
      className={cn(
        "border font-semibold",
        badgeInfo.colorClasses,
        sizeClasses[size],
        className,
      )}
    >
      {showIcon && <Icon className={cn(iconSizes[size], "mr-0.5")} />}
      {badgeInfo.label}
    </Badge>
  );
}

/**
 * Compact badge for tight spaces (just the label)
 */
export function CommunityBadgeCompact({
  communityBadgeTier,
  className,
}: {
  communityBadgeTier: number;
  className?: string;
}) {
  const badgeInfo = getBadgeInfo(communityBadgeTier);

  if (!badgeInfo) return null;

  return (
    <span
      className={cn(
        "rounded px-1 py-0.5 text-[9px] font-bold",
        badgeInfo.colorClasses,
        className,
      )}
    >
      {badgeInfo.label}
    </span>
  );
}

export default CommunityBadge;
