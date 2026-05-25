"use client";

import { memo, useCallback, type KeyboardEvent } from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { cn } from "@/lib/utils";

interface UiPresetCardProps {
  preset: Doc<"ui_preset">;
  isSelected: boolean;
  onClick: () => void;
  isGodMode?: boolean;
}

// ============================================================================
// VALIDATION
// ============================================================================

function isValidPreset(preset: unknown): preset is Doc<"ui_preset"> {
  if (!preset || typeof preset !== "object") return false;
  const p = preset as Doc<"ui_preset">;
  return Boolean(p._id && p.title);
}

// ============================================================================
// COMPONENT
// ============================================================================

/**
 * Card component for displaying a UI preset in the library grid.
 * Supports keyboard navigation and god mode visibility indicators.
 */
export const UiPresetCard = memo(function UiPresetCard({
  preset,
  isSelected,
  onClick,
  isGodMode = false,
}: UiPresetCardProps) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick();
      }
    },
    [onClick],
  );

  const handleClick = useCallback(() => {
    try {
      onClick();
    } catch (error) {
      console.error("[UiPresetCard] Error handling click:", error);
    }
  }, [onClick]);

  if (!isValidPreset(preset)) {
    return null;
  }

  const { title, description, public: isPublic } = preset;
  const displayTitle = title || "Untitled";
  const displayDescription = description || "No description available";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Select ${displayTitle}`}
      className={cn(
        "group cursor-pointer overflow-hidden rounded-lg border transition-all hover:shadow-md",
        isSelected
          ? "border-purple-500 ring-2 ring-purple-500/20"
          : "border-gray-200 hover:border-gray-300",
      )}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {isGodMode && (
        <div className="px-3 pt-3">
          <span
            className={cn(
              "inline-block rounded-full px-2 py-0.5 text-xs font-medium",
              isPublic
                ? "bg-green-100 text-green-700"
                : "bg-yellow-100 text-yellow-700",
            )}
            role="status"
            aria-label={isPublic ? "Public preset" : "Private preset"}
          >
            {isPublic ? "Public" : "Private"}
          </span>
        </div>
      )}

      <div className="p-3">
        <h3 className="font-medium text-gray-900">{displayTitle}</h3>
        <p className="mt-1 line-clamp-2 text-sm text-gray-500">
          {displayDescription}
        </p>
      </div>
    </div>
  );
});
