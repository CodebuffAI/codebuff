// Shared styling constants for monitoring components

/**
 * Standard card styles used throughout monitoring interface
 */
export const CARD_STYLES = {
  standard:
    "rounded-2xl border border-zinc-200/50 bg-white/30 shadow-sm backdrop-blur-sm",
  solid:
    "rounded-2xl border border-zinc-200/40 bg-white/80 shadow-sm backdrop-blur-md",
  gradient:
    "rounded-2xl border border-zinc-200/50 bg-gradient-to-br from-white/70 via-white/50 to-zinc-50/60 shadow-sm backdrop-blur-md",
  error:
    "rounded-2xl border border-red-300/50 bg-gradient-to-br from-red-50/80 to-red-100/60 shadow-sm backdrop-blur-md",
};

/**
 * Tier-specific color schemes for workspace tiers (small, medium, large)
 */
export const TIER_COLORS = {
  small: {
    border: "border-zinc-300",
    bg: "bg-zinc-50",
    selectedBorder: "border-zinc-500",
    selectedBg: "bg-zinc-100",
    badge: "bg-zinc-200 text-zinc-700",
    icon: "text-zinc-500",
  },
  medium: {
    border: "border-blue-300",
    bg: "bg-blue-50",
    selectedBorder: "border-blue-500",
    selectedBg: "bg-blue-100",
    badge: "bg-blue-200 text-blue-700",
    icon: "text-blue-500",
  },
  large: {
    border: "border-purple-300",
    bg: "bg-purple-50",
    selectedBorder: "border-purple-500",
    selectedBg: "bg-purple-100",
    badge: "bg-purple-200 text-purple-700",
    icon: "text-purple-500",
  },
};

/**
 * Common gradient backgrounds
 */
export const GRADIENTS = {
  purple:
    "bg-gradient-to-r from-purple-50/80 via-purple-100/70 to-purple-50/80",
  upgrade:
    "border-purple-200/50 bg-gradient-to-r from-purple-50/80 to-purple-100/60",
  downgrade:
    "border-orange-200/50 bg-gradient-to-r from-orange-50/80 to-orange-100/60",
};

/**
 * Common button styles for actions
 */
export const BUTTON_STYLES = {
  upgrade:
    "bg-gradient-to-r from-purple-500 to-purple-600 hover:from-purple-600 hover:to-purple-700",
  downgrade:
    "bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700",
};
