import React from "react";
import { ThemePickerLayout } from "@/vly/components/ThemePickerLayout";

interface ThemePickerServerProps {
  selectedTheme?: string;
  isSubmitting?: boolean;
  onThemeSelect?: (theme: string) => void;
  onClose?: () => void;
  hoveredTheme?: string;
  onThemeHover?: (theme: string | null) => void;
}

// Server component for the theme picker content
function ThemePickerServer({
  selectedTheme,
  isSubmitting,
  onThemeSelect,
  onClose,
  hoveredTheme,
  onThemeHover,
}: ThemePickerServerProps) {
  const footerContent = (
    <>
      <div className="text-sm text-gray-500">
        {selectedTheme ? (
          <span>
            Selected:{" "}
            <span className="font-semibold text-gray-700">{selectedTheme}</span>
          </span>
        ) : (
          <span>No theme selected</span>
        )}
      </div>

      <div className="flex gap-3">
        {selectedTheme && (
          <button
            type="button"
            className="rounded-lg border border-gray-300 px-4 py-2 font-['Geist'] text-sm font-medium text-gray-600 transition-all hover:border-gray-400 hover:bg-gray-50"
            onClick={() => onThemeSelect?.("")}
          >
            Clear Selection
          </button>
        )}
      </div>
    </>
  );

  return (
    <ThemePickerLayout
      title={
        <>
          Choose Your <span className="text-[#7CFF3F]">Theme</span>
        </>
      }
      subtitle="Select a visual style for your project"
      selectedTheme={selectedTheme}
      isSubmitting={isSubmitting}
      hoveredTheme={hoveredTheme}
      onThemeSelect={onThemeSelect}
      onThemeHover={onThemeHover}
      onClose={onClose}
      footerContent={footerContent}
    />
  );
}

export default ThemePickerServer;
