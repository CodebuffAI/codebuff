import React from "react";
import { themeMetadata } from "@/vly/lib/theme-metadata";

interface ThemeBadgeProps {
  theme: string;
  onRemove: () => void;
  className?: string;
}

interface ThemeBadgeStyles {
  borderColor: string;
  backgroundColor: string;
  backgroundImage?: string;
  backgroundSize?: string;
  textColor: string;
  borderStyle: string;
  shadowStyle: string;
  icon: string;
}

// Helper function to get theme font style
const getThemeFont = (theme: string): string => {
  const metadata = themeMetadata[theme];
  if (!metadata?.font) return "font-['Geist']";

  const fontMap: Record<string, string> = {
    Geist: "font-['Geist']",
    Inter: "font-['Inter']",
    "Space Grotesk": "font-['Space_Grotesk']",
    "SF Pro": "font-['SF_Pro_Display']",
    "SF Pro Display": "font-['SF_Pro_Display']",
    Roboto: "font-['Roboto']",
    "Fira Code": "font-['Fira_Code']",
    "Arial Rounded": "font-['Arial_Rounded_MT_Bold']",
    "Playfair Display": "font-['Playfair_Display']",
    "JetBrains Mono": "font-['JetBrains_Mono']",
  };

  return fontMap[metadata.font] || "font-['Geist']";
};

// Helper function to get theme badge styles
const getThemeBadgeStyles = (theme: string): ThemeBadgeStyles => {
  const metadata = themeMetadata[theme];

  // Default fallback styles
  const defaultStyles: ThemeBadgeStyles = {
    borderColor: "#A37FBC",
    backgroundColor: "rgba(163, 127, 188, 0.1)",
    textColor: "#A37FBC",
    borderStyle: "border",
    shadowStyle: "",
    icon: "⚡",
  };

  if (!metadata) return defaultStyles;

  const baseStyles: ThemeBadgeStyles = {
    borderColor: metadata.colors.primary,
    backgroundColor: `${metadata.colors.primary}15`, // 15 is roughly 8% opacity
    textColor: metadata.colors.primary,
    borderStyle: metadata.borderStyle ? "border-0" : "border",
    shadowStyle: metadata.shadowStyle || "",
    icon: metadata.icon,
  };

  // Handle special theme cases
  const specialThemes: Record<string, Partial<ThemeBadgeStyles>> = {
    Papery: {
      backgroundColor: "#F0EEE6",
      backgroundImage: `
        linear-gradient(180deg, rgba(47, 36, 26, 0.06) 1px, transparent 1px),
        radial-gradient(circle at 20% 20%, rgba(255,255,255,0.55), transparent 45%)
      `,
      backgroundSize: "100% 12px, 100% 100%",
    },
    Notebook: {
      backgroundColor: "#F7F3E9",
      backgroundImage: `
        linear-gradient(180deg, rgba(29, 78, 216, 0.12) 1px, transparent 1px),
        linear-gradient(90deg, rgba(224, 108, 117, 0.45) 0, rgba(224, 108, 117, 0.45) 2px, transparent 2px)
      `,
      backgroundSize: "100% 10px, 100% 100%",
    },
    Claymorphism: {
      backgroundColor: "#FBE7DE",
      backgroundImage: `
        radial-gradient(circle at 20% 20%, rgba(255,255,255,0.65), transparent 42%),
        radial-gradient(circle at 80% 30%, rgba(140,115,255,0.18), transparent 35%)
      `,
      backgroundSize: "100% 100%, 100% 100%",
    },
    Vintage: {
      backgroundColor: "#E6D7BD",
      backgroundImage: `
        linear-gradient(180deg, rgba(108, 76, 44, 0.06) 1px, transparent 1px),
        radial-gradient(circle at 50% 50%, rgba(255,255,255,0.18), transparent 60%)
      `,
      backgroundSize: "100% 14px, 100% 100%",
    },
    Glassmorphism: {
      borderColor: "rgba(255, 255, 255, 0.28)",
      backgroundColor: "rgba(255, 255, 255, 0.12)",
      backgroundImage: `
        radial-gradient(circle at 20% 20%, rgba(143,231,255,0.45), transparent 38%),
        radial-gradient(circle at 80% 25%, rgba(255,158,205,0.32), transparent 30%),
        linear-gradient(135deg, rgba(255,255,255,0.18), rgba(255,255,255,0.05))
      `,
      backgroundSize: "100% 100%, 100% 100%, 100% 100%",
      textColor: "#F8FAFC",
    },
    Terminal: {
      backgroundColor: "#08110D",
      backgroundImage: `
        linear-gradient(rgba(124, 255, 155, 0.08) 1px, transparent 1px),
        linear-gradient(90deg, rgba(49, 208, 170, 0.06) 1px, transparent 1px)
      `,
      backgroundSize: "100% 4px, 8px 100%",
      textColor: "#7CFF9B",
    },
    "Neobrutalism Minimalism": {
      borderColor: "#111111",
      backgroundColor: "#F7F4EC",
      textColor: "#111111",
    },
  };

  return { ...baseStyles, ...specialThemes[theme] };
};

// Helper function to get theme color dots
const getThemeColorDots = (theme: string) => {
  const metadata = themeMetadata[theme];
  if (!metadata) return [];

  const colors = [];

  // Add primary color as first dot
  if (metadata.colors.primary) {
    colors.push(metadata.colors.primary);
  }

  // Add secondary color as second dot
  if (metadata.colors.secondary) {
    colors.push(metadata.colors.secondary);
  }

  // Add accent color as third dot if it exists
  if (metadata.colors.accent) {
    colors.push(metadata.colors.accent);
  }

  // If we don't have accent, try to add a background color for themes that use it as a key color
  if (
    !metadata.colors.accent &&
    metadata.colors.background &&
    metadata.colors.background.startsWith("#")
  ) {
    colors.push(metadata.colors.background);
  }

  // Return all 3 colors as dots
  return colors.slice(0, 3);
};

export function ThemeBadge({
  theme,
  onRemove,
  className = "",
}: ThemeBadgeProps) {
  if (!theme) return null;

  const themeStyles = getThemeBadgeStyles(theme);
  const colorDots = getThemeColorDots(theme);
  const colorNames = ["Primary", "Secondary", "Accent"];

  return (
    <div
      className={`flex-shrink-0 transition-opacity duration-300 animate-in fade-in-0 ${className}`}
    >
      <div
        className={`flex h-10 items-center gap-2 rounded-full px-3 sm:h-12 ${themeStyles.borderStyle}`}
        style={{
          borderColor: themeStyles.borderColor,
          backgroundColor: themeStyles.backgroundColor,
          backgroundImage: themeStyles.backgroundImage,
          backgroundSize: themeStyles.backgroundSize,
          boxShadow: themeStyles.shadowStyle,
          ...(themeMetadata[theme]?.borderStyle && {
            border: themeMetadata[theme].borderStyle,
          }),
        }}
      >
        {/* Theme name */}
        <span
          className={`${getThemeFont(theme)} text-sm font-medium`}
          style={{ color: themeStyles.textColor }}
        >
          {theme}
        </span>

        {/* Color dots */}
        {colorDots.length > 0 && (
          <div className="flex items-center gap-1">
            {colorDots.map((color, index) => (
              <div
                key={index}
                className="h-2 w-2 rounded-full border border-white/20"
                style={{ backgroundColor: color }}
                title={`${theme} ${colorNames[index] || "Color"}: ${color}`}
              />
            ))}
          </div>
        )}

        {/* Remove button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 flex h-4 w-4 items-center justify-center rounded-full transition-colors"
          style={{
            color: themeStyles.textColor,
            backgroundColor: "transparent",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = `${themeStyles.borderColor}20`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
          title="Remove theme"
        >
          ×
        </button>
      </div>
    </div>
  );
}
