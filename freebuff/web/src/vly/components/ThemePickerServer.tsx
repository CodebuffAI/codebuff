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
      <div className="text-sm text-muted-foreground">
        {selectedTheme || "No style selected"}
      </div>

      {selectedTheme && (
        <button
          type="button"
          className="rounded-md bg-muted px-3 py-1.5 font-['Geist'] text-sm font-medium text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
          onClick={() => onThemeSelect?.("")}
        >
          Clear
        </button>
      )}
    </>
  );

  return (
    <ThemePickerLayout
      title={
        <>
          Choose a <span className="text-primary">style</span>
        </>
      }
      subtitle=""
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
