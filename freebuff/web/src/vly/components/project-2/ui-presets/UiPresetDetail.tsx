"use client";

import { useState, useCallback, useMemo, memo } from "react";
import { Doc } from "@/convex/_generated/dataModel";
import { Button } from "@/vly/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import {
  ExternalLink,
  Edit3,
  Trash2,
  Copy,
  Check,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { LiveComponentPreview } from "./LiveComponentPreview";
import { useFeatureAccess } from "@/vly/hooks/useFeatureAccess";

// ============================================================================
// TYPES
// ============================================================================

interface UiPresetDetailProps {
  preset: Doc<"ui_preset">;
  isGodMode?: boolean;
  onAddToProject: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}

type TabValue = "preview" | "code";

interface ThemeStyles {
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

interface ParsedTheme {
  styles?: ThemeStyles;
  light?: Record<string, string>;
  dark?: Record<string, string>;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLOR_PALETTE = [
  "primary",
  "secondary",
  "accent",
  "muted",
  "destructive",
] as const;
const COPY_RESET_DELAY = 2000;

// ============================================================================
// VALIDATION
// ============================================================================

function isValidURL(url: string): boolean {
  if (!url?.trim()) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function isValidThemeStyles(styles: unknown): styles is Record<string, string> {
  if (!styles || typeof styles !== "object") return false;
  return Object.values(styles).every((v) => typeof v === "string");
}

// ============================================================================
// THEME PARSER
// ============================================================================

/**
 * Attempts to parse theme code in various formats (JSON, JS object notation).
 * Returns null if parsing fails.
 */
function parseThemeCode(themeCode: string): ParsedTheme | null {
  if (!themeCode?.trim()) {
    console.warn("[UiPresetDetail] Empty theme code provided");
    return null;
  }

  // Try JSON.parse first
  try {
    const parsed = JSON.parse(themeCode);
    if (parsed && typeof parsed === "object") {
      return parsed as ParsedTheme;
    }
  } catch {
    // Continue to fallback parsing
  }

  // Fallback: try to parse JS object notation
  try {
    let cleanedCode = themeCode.trim();

    // Handle format: `themeName: { ... }` or `themeName: { ... },`
    const topLevelMatch = cleanedCode.match(
      /^[a-zA-Z_]\w*\s*:\s*(\{[\s\S]*\})\s*,?\s*$/,
    );
    if (topLevelMatch?.[1]) {
      cleanedCode = topLevelMatch[1].trim();
    }

    // Extract object if not starting with {
    if (!cleanedCode.startsWith("{")) {
      const firstBrace = cleanedCode.indexOf("{");
      const lastBrace = cleanedCode.lastIndexOf("}");
      if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleanedCode = cleanedCode.substring(firstBrace, lastBrace + 1);
      } else {
        throw new Error("No valid object braces found");
      }
    }

    // Convert JS object notation to JSON
    const jsonified = cleanedCode
      .replace(/([{,]\s*)([a-zA-Z_][\w-]*)\s*:/g, '$1"$2":')
      .replace(/,(\s*[}\]])/g, "$1");

    const parsed = JSON.parse(jsonified);
    if (parsed && typeof parsed === "object") {
      return parsed as ParsedTheme;
    }
  } catch (error) {
    console.error(
      "[UiPresetDetail] Failed to parse theme:",
      error instanceof Error ? error.message : error,
    );
  }

  return null;
}

/**
 * Generates scoped CSS from parsed theme.
 */
function generateThemeCSS(
  themeCode: string,
  isDark: boolean,
  containerId: string,
): string | null {
  if (!themeCode?.trim() || !containerId?.trim()) {
    console.warn("[UiPresetDetail] Invalid inputs for CSS generation");
    return null;
  }

  const theme = parseThemeCode(themeCode);
  if (!theme) return null;

  // Try to get styles from theme.styles.light/dark or theme.light/dark
  const styles = isDark
    ? theme.styles?.dark || theme.dark
    : theme.styles?.light || theme.light;

  if (!isValidThemeStyles(styles)) {
    console.warn("[UiPresetDetail] Invalid theme styles structure");
    return null;
  }

  if (Object.keys(styles).length === 0) {
    return null;
  }

  try {
    const cssVars = Object.entries(styles)
      .filter(([key, value]) => key && value)
      .map(([key, value]) => `--${key}: ${value};`)
      .join("\n  ");

    if (!cssVars) return null;

    return `#${containerId} {\n  ${cssVars}\n}`;
  } catch (error) {
    console.error("[UiPresetDetail] Error generating CSS:", error);
    return null;
  }
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface ThemeModeToggleProps {
  isDarkMode: boolean;
  onToggle: () => void;
}

const ThemeModeToggle = memo(function ThemeModeToggle({
  isDarkMode,
  onToggle,
}: ThemeModeToggleProps) {
  return (
    <div className="absolute right-2 top-2 z-10">
      <Button
        variant="outline"
        size="sm"
        onClick={onToggle}
        className="flex items-center gap-1"
      >
        {isDarkMode ? (
          <>
            <Sun className="h-4 w-4" />
            Light
          </>
        ) : (
          <>
            <Moon className="h-4 w-4" />
            Dark
          </>
        )}
      </Button>
    </div>
  );
});

interface ColorSwatchProps {
  color: string;
}

const ColorSwatch = memo(function ColorSwatch({ color }: ColorSwatchProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className="h-8 w-8 rounded shadow-sm"
        style={{ backgroundColor: `var(--${color})` }}
      />
      <span
        className="mt-0.5 text-[9px] capitalize"
        style={{ color: "var(--muted-foreground)" }}
      >
        {color}
      </span>
    </div>
  );
});

interface ThemePreviewButtonProps {
  variant: "primary" | "secondary" | "outline";
  label: string;
}

const ThemePreviewButton = memo(function ThemePreviewButton({
  variant,
  label,
}: ThemePreviewButtonProps) {
  const styles: React.CSSProperties = {
    ...(variant === "primary" && {
      backgroundColor: "var(--primary)",
      color: "var(--primary-foreground)",
    }),
    ...(variant === "secondary" && {
      backgroundColor: "var(--secondary)",
      color: "var(--secondary-foreground)",
    }),
    ...(variant === "outline" && {
      borderColor: "var(--border)",
      backgroundColor: "var(--background)",
    }),
  };

  return (
    <button
      className={`rounded px-2 py-1 text-[10px] font-medium ${
        variant === "outline" ? "border" : ""
      }`}
      style={styles}
    >
      {label}
    </button>
  );
});

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const UiPresetDetail = memo(function UiPresetDetail({
  preset,
  isGodMode = false,
  onAddToProject,
  onEdit,
  onDelete,
}: UiPresetDetailProps) {
  const [activeTab, setActiveTab] = useState<TabValue>("preview");
  const [copied, setCopied] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  const { hasAccess } = useFeatureAccess("ui_components_library");

  // Unique ID for scoping theme CSS
  const themePreviewId = useMemo(
    () => `theme-preview-${preset._id}`,
    [preset._id],
  );

  const isTheme = preset.category === "theme";
  const presetType = isTheme ? "Theme" : "Component";

  const handleCopyCode = async () => {
    if (!navigator?.clipboard) {
      toast.error("Clipboard not available", {
        description: "Your browser doesn't support clipboard access",
      });
      return;
    }

    if (!preset?.code?.trim()) {
      toast.error("No code to copy");
      return;
    }

    try {
      await navigator.clipboard.writeText(preset.code);
      setCopied(true);
      toast.success("Code copied to clipboard");
      setTimeout(() => setCopied(false), COPY_RESET_DELAY);
    } catch (error) {
      console.error("[UiPresetDetail] Failed to copy:", error);
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      toast.error("Failed to copy code", {
        description: errorMsg || "Please try selecting and copying manually",
      });
    }
  };

  const handleTabChange = useCallback((value: string) => {
    setActiveTab(value as TabValue);
  }, []);

  const toggleDarkMode = useCallback(() => {
    setIsDarkMode((prev) => !prev);
  }, []);

  // Memoize theme CSS generation
  const themeCSS = useMemo(() => {
    if (!isTheme) return null;
    return generateThemeCSS(preset.code, isDarkMode, themePreviewId);
  }, [isTheme, preset.code, isDarkMode, themePreviewId]);

  const renderThemePreview = () => {
    if (!themeCSS) {
      return (
        <div className="flex h-32 items-center justify-center text-gray-500">
          <p className="text-xs">Invalid theme format. Unable to preview.</p>
        </div>
      );
    }

    return (
      <div className="relative">
        <ThemeModeToggle isDarkMode={isDarkMode} onToggle={toggleDarkMode} />

        <div
          className={`overflow-hidden rounded-lg border ${
            isDarkMode ? "bg-gray-900" : "bg-white"
          }`}
        >
          <style>{themeCSS}</style>
          <div
            id={themePreviewId}
            className="max-h-[250px] overflow-y-auto p-3"
            style={{
              backgroundColor: "var(--background)",
              color: "var(--foreground)",
            }}
          >
            {/* Color Palette */}
            <section className="mb-3">
              <h3
                className="mb-2 text-xs font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Colors
              </h3>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PALETTE.map((color) => (
                  <ColorSwatch key={color} color={color} />
                ))}
              </div>
            </section>

            {/* Buttons */}
            <section className="mb-3">
              <h3
                className="mb-2 text-xs font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Buttons
              </h3>
              <div className="flex flex-wrap gap-1.5">
                <ThemePreviewButton variant="primary" label="Primary" />
                <ThemePreviewButton variant="secondary" label="Secondary" />
                <ThemePreviewButton variant="outline" label="Outline" />
              </div>
            </section>

            {/* Card */}
            <section className="mb-3">
              <h3
                className="mb-2 text-xs font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Card
              </h3>
              <div
                className="rounded-lg border p-2.5 shadow-sm"
                style={{
                  backgroundColor: "var(--card)",
                  color: "var(--card-foreground)",
                  borderColor: "var(--border)",
                }}
              >
                <h4 className="mb-1 text-sm font-semibold">Card Title</h4>
                <p
                  className="text-xs"
                  style={{ color: "var(--muted-foreground)" }}
                >
                  This is a sample card with some description text.
                </p>
              </div>
            </section>

            {/* Typography */}
            <section className="mb-3">
              <h3
                className="mb-2 text-xs font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Typography
              </h3>
              <h1 className="text-xl font-bold">Heading 1</h1>
              <h2 className="text-lg font-semibold">Heading 2</h2>
              <p
                className="mt-1 text-xs"
                style={{ color: "var(--muted-foreground)" }}
              >
                Body text with muted color.
              </p>
            </section>

            {/* Input */}
            <section>
              <h3
                className="mb-2 text-xs font-medium"
                style={{ color: "var(--muted-foreground)" }}
              >
                Input
              </h3>
              <input
                type="text"
                placeholder="Enter something..."
                className="w-full max-w-xs rounded-md border px-2 py-1.5 text-xs"
                style={{
                  borderColor: "var(--input)",
                  backgroundColor: "var(--background)",
                }}
                readOnly
              />
            </section>
          </div>
        </div>
      </div>
    );
  };

  const renderComponentPreview = () => (
    <div className="overflow-hidden rounded-lg border">
      <LiveComponentPreview code={preset.code} />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold sm:text-2xl">{preset.title}</h2>
            <span
              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                isTheme
                  ? "bg-purple-100 text-purple-700"
                  : "bg-blue-100 text-blue-700"
              }`}
            >
              {presetType}
            </span>
          </div>
          <p className="mt-2 text-gray-600">
            {preset.description || "No description"}
          </p>

          {preset.source_url && isValidURL(preset.source_url) && (
            <a
              href={preset.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
            >
              View Original Source
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isGodMode && (
            <>
              <Button variant="outline" size="sm" onClick={onEdit}>
                <Edit3 className="mr-1 h-4 w-4" />
                Edit
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={onDelete}
                className="text-red-600 hover:bg-red-50 hover:text-red-700"
              >
                <Trash2 className="mr-1 h-4 w-4" />
                Delete
              </Button>
            </>
          )}
          <Button onClick={onAddToProject} className="flex items-center gap-2">
            Send to AI
            {!hasAccess && (
              <span className="rounded-full border border-indigo-200 bg-indigo-100 px-1.5 py-0 text-[10px] font-medium text-indigo-700">
                Scale
              </span>
            )}
          </Button>
        </div>
      </header>

      {/* Tags */}
      {Array.isArray(preset.tags) && preset.tags.length > 0 && (
        <div className="flex flex-wrap gap-2" role="list" aria-label="Tags">
          {preset.tags.filter(Boolean).map((tag, index) => (
            <span
              key={`${tag}-${index}`}
              className="rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-600"
              role="listitem"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Preview/Code Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="preview">Preview</TabsTrigger>
          <TabsTrigger value="code">Code</TabsTrigger>
        </TabsList>

        <TabsContent value="preview" className="mt-4">
          {isTheme ? renderThemePreview() : renderComponentPreview()}
        </TabsContent>

        <TabsContent value="code" className="mt-4">
          <div className="relative">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopyCode}
              className="absolute right-2 top-2 z-10"
            >
              {copied ? (
                <>
                  <Check className="mr-1 h-4 w-4" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="mr-1 h-4 w-4" />
                  Copy
                </>
              )}
            </Button>
            <pre className="max-h-[500px] overflow-auto rounded-lg border bg-gray-900 p-4 text-sm text-gray-100">
              <code>{preset.code}</code>
            </pre>
          </div>
        </TabsContent>
      </Tabs>

      {/* Last Updated */}
      {preset.last_updated && (
        <footer className="text-xs text-gray-500">
          Last updated:{" "}
          {(() => {
            try {
              const date = new Date(preset.last_updated);
              if (isNaN(date.getTime())) {
                return "Unknown";
              }
              return (
                <time dateTime={date.toISOString()}>
                  {date.toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </time>
              );
            } catch (error) {
              console.error("[UiPresetDetail] Invalid date:", error);
              return "Unknown";
            }
          })()}
        </footer>
      )}
    </div>
  );
});
