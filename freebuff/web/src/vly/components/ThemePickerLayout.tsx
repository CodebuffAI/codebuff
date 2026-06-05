import React from "react";
import { featuredThemes, themes } from "@/vly/lib/theme-prompts";
import { ThemeCard } from "@/vly/components/ThemePreview";

interface ThemePickerLayoutProps {
  title: React.ReactNode;
  subtitle: string;
  selectedTheme?: string;
  isSubmitting?: boolean;
  hoveredTheme?: string | null;
  onThemeSelect?: (theme: string) => void;
  onThemeHover?: (theme: string | null) => void;
  onClose?: () => void;
  footerContent: React.ReactNode;
}

export function ThemePickerLayout({
  title,
  subtitle,
  selectedTheme,
  isSubmitting,
  hoveredTheme,
  onThemeSelect,
  onThemeHover,
  onClose,
  footerContent,
}: ThemePickerLayoutProps) {
  const featuredThemeSet = new Set<string>(featuredThemes);
  const remainingThemes = themes.filter(
    (theme) => !featuredThemeSet.has(theme),
  );

  return (
    <div className="flex max-h-[88vh] w-[min(1120px,94vw)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl shadow-black/40">
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: hsl(var(--background));
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: hsl(var(--border));
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: hsl(var(--muted-foreground));
        }
      `}</style>

      {/* Header - Fixed */}
      <div className="relative flex w-full flex-shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-5 py-4 sm:px-6">
        <div>
          <h2 className="font-['Geist'] text-xl font-medium leading-tight text-foreground sm:text-2xl">
            {title}
          </h2>
          <p className="mt-1 font-['Geist'] text-sm text-muted-foreground">
            {subtitle}
          </p>
        </div>
        <button
          onClick={onClose}
          className="group flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          aria-label="Close theme picker"
        >
          <svg
            className="h-5 w-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Theme Grid - Scrollable */}
      <div
        className="custom-scrollbar flex-1 overflow-y-auto bg-background px-5 py-5 sm:px-6"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "hsl(var(--border)) hsl(var(--background))",
        }}
      >
        {/* Recommended Section */}
        <div className="mb-6">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-['Geist'] text-sm font-semibold text-foreground">
              Recommended
            </h3>
            <span className="rounded-full border border-border bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground">
              Curated
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {featuredThemes.map((theme) => (
              <ThemeCard
                key={theme}
                theme={theme}
                isSelected={selectedTheme === theme}
                isSubmitting={isSubmitting}
                isHovered={hoveredTheme === theme}
                size="large"
                onSelect={onThemeSelect}
                onHover={onThemeHover}
              />
            ))}
          </div>
        </div>

        {/* All Themes Section */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <h3 className="font-['Geist'] text-sm font-semibold text-foreground">
              All Themes
            </h3>
            <span className="text-sm text-muted-foreground">
              ({remainingThemes.length} more)
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 pb-5 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
            {remainingThemes.map((theme) => (
              <ThemeCard
                key={theme}
                theme={theme}
                isSelected={selectedTheme === theme}
                isSubmitting={isSubmitting}
                isHovered={hoveredTheme === theme}
                size="compact"
                onSelect={onThemeSelect}
                onHover={onThemeHover}
              />
            ))}
          </div>
        </div>
      </div>

      {/* Footer Actions - Fixed at bottom */}
      <div className="flex w-full flex-shrink-0 items-center justify-between gap-4 border-t border-border bg-background px-5 py-4 sm:px-6">
        {footerContent}
      </div>
    </div>
  );
}
