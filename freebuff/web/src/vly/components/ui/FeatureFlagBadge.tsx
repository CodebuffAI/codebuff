import { Badge } from "@/vly/components/ui/badge";
import { cn } from "@/vly/lib/utils";

type RolloutStrategy =
  | "god_only"
  | "beta"
  | "percentage"
  | "enabled"
  | "disabled";

interface FeatureFlagBadgeProps {
  rolloutStrategy: RolloutStrategy;
  className?: string;
}

export function FeatureFlagBadge({
  rolloutStrategy,
  className,
}: FeatureFlagBadgeProps) {
  // Don't show badge for disabled features (they shouldn't be visible anyway)
  if (rolloutStrategy === "disabled") {
    return null;
  }

  const getBadgeConfig = (strategy: RolloutStrategy) => {
    switch (strategy) {
      case "god_only":
        return {
          text: "God",
          className:
            "bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-100",
        };
      case "beta":
        return {
          text: "Beta",
          className:
            "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100",
        };
      case "percentage":
      case "enabled":
        return {
          text: "New",
          className:
            "bg-green-100 text-green-700 border-green-200 hover:bg-green-100",
        };
      default:
        return null;
    }
  };

  const config = getBadgeConfig(rolloutStrategy);

  if (!config) {
    return null;
  }

  return (
    <Badge
      variant="outline"
      className={cn(
        "ml-1.5 px-1.5 py-0 text-[10px] font-medium leading-tight",
        config.className,
        className,
      )}
    >
      {config.text}
    </Badge>
  );
}
