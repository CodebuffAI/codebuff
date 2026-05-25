import React from "react";
import { featuredThemes, themes } from "@/lib/theme-prompts";
import { ThemeCard } from "@/components/ThemePreview";

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
    <div className="flex max-h-[95vh] min-h-[80vh] w-[90vw] max-w-[1400px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <style jsx>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: #f3f4f6;
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(168, 85, 247, 0.3);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(147, 51, 234, 0.5);
        }
      `}</style>

      {/* Header - Fixed */}
      <div className="relative flex w-full flex-shrink-0 items-center justify-between border-b border-gray-100 bg-gradient-to-r from-white to-gray-50/50 px-16 py-8">
        <div>
          <h2 className="font-['Geist'] text-2xl font-normal leading-none text-gray-900 sm:text-3xl">
            {title}
          </h2>
          <p className="mt-1.5 font-['Geist'] text-sm text-gray-500">
            {subtitle}
          </p>
        </div>
        <button
          onClick={onClose}
          className="group flex h-10 w-10 items-center justify-center rounded-lg transition-all hover:bg-gray-100"
        >
          <svg
            className="h-5 w-5 text-gray-400 transition-colors group-hover:text-gray-600"
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
        className="custom-scrollbar flex-1 overflow-y-auto bg-gradient-to-b from-gray-100/60 via-gray-50/40 to-gray-100/30 px-16 py-12"
        style={{
          scrollbarWidth: "thin",
          scrollbarColor: "rgba(168, 85, 247, 0.3) #f3f4f6",
        }}
      >
        {/* Recommended Section */}
        <div className="mb-8">
          <div className="mb-4 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/70 bg-white/50 backdrop-blur-sm">
              <svg
                className="h-5 w-5 text-yellow-500"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
            <h3 className="font-['Geist'] text-base font-semibold text-gray-800">
              Recommended Themes
            </h3>
            <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
              Curated
            </span>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          <div className="mb-4 flex items-center gap-2">
            <h3 className="font-['Geist'] text-base font-semibold text-gray-800">
              All Themes
            </h3>
            <span className="text-sm text-gray-500">
              ({remainingThemes.length} more)
            </span>
          </div>
          <div className="grid grid-cols-2 gap-4 pb-12 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
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
      <div className="flex w-full flex-shrink-0 items-center justify-between border-t border-gray-100 bg-gradient-to-r from-gray-50/50 to-white px-16 py-6">
        {footerContent}
      </div>
    </div>
  );
}
