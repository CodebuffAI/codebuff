import { Button } from "@/vly/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/vly/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/vly/components/ui/dialog";
import { FontSelector } from "@/vly/components/ui/font-selector";
import { Input } from "@/vly/components/ui/input";
import { Label } from "@/vly/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/vly/components/ui/popover";
import { ScrollArea } from "@/vly/components/ui/scroll-area";
import { Separator } from "@/vly/components/ui/separator";
import { Slider } from "@/vly/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/vly/components/ui/tabs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useAction } from "convex/react";
import { formatHex, formatRgb, oklch, parse } from "culori";
import { motion } from "framer-motion";
import { ChevronRight, Palette, Type } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { HexColorPicker } from "react-colorful";
import { FeatureGate, UpgradePrompt } from "@/vly/components/billing/FeatureGate";

interface ThemeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: Id<"project">;
}

interface ColorCategory {
  name: string;
  colors: {
    main: string;
    foreground: string;
  };
}

interface ThemeConfig {
  colors: {
    [key: string]: ColorCategory;
  };
  typography: {
    fontSans: string;
    fontSerif: string;
    fontMono: string;
    letterSpacing: number;
  };
}

// Use a local default config for the frontend (since we can't import from convex utils in frontend)
const DEFAULT_THEME_CONFIG: ThemeConfig = {
  colors: {
    primary: {
      name: "Primary Colors",
      colors: {
        main: "oklch(0.205 0 0)",
        foreground: "oklch(0.985 0 0)",
      },
    },
    secondary: {
      name: "Secondary Colors",
      colors: {
        main: "oklch(0.97 0 0)",
        foreground: "oklch(0.205 0 0)",
      },
    },
    accent: {
      name: "Accent Colors",
      colors: {
        main: "oklch(0.97 0 0)",
        foreground: "oklch(0.205 0 0)",
      },
    },
    base: {
      name: "Base Colors",
      colors: {
        main: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
      },
    },
    card: {
      name: "Card Colors",
      colors: {
        main: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
      },
    },
    popover: {
      name: "Popover Colors",
      colors: {
        main: "oklch(1 0 0)",
        foreground: "oklch(0.145 0 0)",
      },
    },
    muted: {
      name: "Muted Colors",
      colors: {
        main: "oklch(0.97 0 0)",
        foreground: "oklch(0.556 0 0)",
      },
    },
    destructive: {
      name: "Destructive Colors",
      colors: {
        main: "oklch(0.577 0.245 27.325)",
        foreground: "oklch(0.985 0 0)",
      },
    },
    border: {
      name: "Border & Input Colors",
      colors: {
        main: "oklch(0.922 0 0)",
        foreground: "oklch(0.708 0 0)",
      },
    },
    chart: {
      name: "Chart Colors",
      colors: {
        main: "oklch(0.646 0.222 41.116)",
        foreground: "oklch(0.6 0.118 184.704)",
      },
    },
    sidebar: {
      name: "Sidebar Colors",
      colors: {
        main: "oklch(0.985 0 0)",
        foreground: "oklch(0.145 0 0)",
      },
    },
  },
  typography: {
    fontSans: "system-ui",
    fontSerif: "Georgia",
    fontMono: "Menlo",
    letterSpacing: 0,
  },
};

// Convert OKLCH to hex or RGB for display
function oklchToDisplayColor(
  oklchStr: string,
  format: "hex" | "rgb" = "hex",
): string {
  try {
    const parsed = parse(oklchStr);
    if (!parsed) return format === "hex" ? "#cccccc" : "rgb(204, 204, 204)";

    return format === "hex" ? formatHex(parsed) : formatRgb(parsed);
  } catch (error) {
    console.warn("OKLCH conversion error:", error);
    return format === "hex" ? "#cccccc" : "rgb(204, 204, 204)";
  }
}

// Convert user input (hex/RGB) to OKLCH for CSS variables
function inputColorToOklch(input: string): { oklch: string; isValid: boolean } {
  try {
    const parsed = parse(input.trim());
    if (!parsed) return { oklch: "", isValid: false };

    const convertedOklch = oklch(parsed);
    if (!convertedOklch) return { oklch: "", isValid: false };

    const oklchStr = `oklch(${convertedOklch.l.toFixed(3)} ${convertedOklch.c.toFixed(3)} ${convertedOklch.h ? convertedOklch.h.toFixed(1) : 0})`;

    return { oklch: oklchStr, isValid: true };
  } catch (error) {
    console.warn("Color input conversion error:", error);
    return { oklch: "", isValid: false };
  }
}

const ColorPicker: React.FC<{
  value: string; // OKLCH value from the theme
  onChange: (value: string) => void; // Expects OKLCH value
  label: string;
}> = ({ value, onChange, label }) => {
  const [displayFormat, setDisplayFormat] = useState<"hex" | "rgb">("hex");
  const [inputValue, setInputValue] = useState("");
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);

  // Convert OKLCH to display format when value changes (only if user isn't actively typing)
  React.useEffect(() => {
    if (!isUserTyping) {
      const displayColor = oklchToDisplayColor(value, displayFormat);
      setInputValue(displayColor);
    }
  }, [value, displayFormat, isUserTyping]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      setIsUserTyping(true);

      // Smart RGB formatting and parsing
      let formattedValue = newValue;
      let colorToConvert = newValue;

      if (displayFormat === "rgb" && newValue && !newValue.startsWith("rgb(")) {
        // Handle different RGB input formats

        // Case 1: Just numbers "255 0 0" or "255, 0, 0"
        const numbersOnly = newValue.match(
          /^\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*$/,
        );
        if (numbersOnly) {
          formattedValue = `rgb(${numbersOnly[1]}, ${numbersOnly[2]}, ${numbersOnly[3]})`;
          colorToConvert = formattedValue;
        }
        // Case 2: Numbers in parentheses "(255, 0, 0)" or "(255 0 0)"
        else {
          const parenthesesNumbers = newValue.match(
            /^\s*\(\s*(\d+)\s*[,\s]\s*(\d+)\s*[,\s]\s*(\d+)\s*\)\s*$/,
          );
          if (parenthesesNumbers) {
            formattedValue = `rgb(${parenthesesNumbers[1]}, ${parenthesesNumbers[2]}, ${parenthesesNumbers[3]})`;
            colorToConvert = formattedValue;
          }
          // Case 3: Partial input - don't convert yet, just let user keep typing
          else {
            const partialNumbers = newValue.match(
              /^\s*\(?\s*(\d+)(?:\s*[,\s]\s*(\d+))?(?:\s*[,\s]\s*(\d+)?)?\s*\)?\s*$/,
            );
            if (partialNumbers && (!partialNumbers[2] || !partialNumbers[3])) {
              // Still typing, don't convert
              setInputValue(newValue);
              return;
            }
          }
        }
      }

      // Update the displayed input value
      setInputValue(formattedValue);

      // Convert to OKLCH for the theme
      const converted = inputColorToOklch(colorToConvert);
      if (converted.isValid) {
        onChange(converted.oklch);
      }
    },
    [onChange, displayFormat],
  );

  const handleInputBlur = useCallback(() => {
    setIsUserTyping(false);
  }, []);

  const handleInputFocus = useCallback(() => {
    setIsUserTyping(true);
  }, []);

  const handleFormatToggle = () => {
    setDisplayFormat((prev) => (prev === "hex" ? "rgb" : "hex"));
    setIsUserTyping(false); // Reset typing state when switching formats
  };

  // Handle color picker changes
  const handleColorPickerChange = useCallback(
    (color: string) => {
      const converted = inputColorToOklch(color);
      if (converted.isValid) {
        onChange(converted.oklch);
        // Update input value to match the picked color
        const displayColor = oklchToDisplayColor(
          converted.oklch,
          displayFormat,
        );
        setInputValue(displayColor);
      }
    },
    [onChange, displayFormat],
  );

  // Get preview color (always use the original OKLCH value for accurate preview)
  const previewColor = oklchToDisplayColor(value, "hex");

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">{label}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleFormatToggle}
          className="h-6 px-2 text-xs"
        >
          {displayFormat.toUpperCase()}
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <Popover open={colorPickerOpen} onOpenChange={setColorPickerOpen}>
          <PopoverTrigger asChild>
            <div
              className="h-6 w-6 flex-shrink-0 cursor-pointer rounded-md border border-gray-300 shadow-sm transition-colors hover:border-gray-400"
              style={{ backgroundColor: previewColor }}
              title={`Click to open color picker. Current: ${value}`}
            />
          </PopoverTrigger>
          <PopoverContent className="w-auto p-4" align="start">
            <div className="space-y-4">
              <div className="text-sm font-medium text-gray-800">
                Pick a color
              </div>
              <HexColorPicker
                color={previewColor}
                onChange={handleColorPickerChange}
                style={{ width: "200px", height: "150px" }}
              />
              <div className="rounded-md bg-gray-50 px-3 py-2 text-center font-mono text-sm text-gray-600">
                {displayFormat === "rgb"
                  ? oklchToDisplayColor(value, "rgb")
                  : previewColor}
              </div>
            </div>
          </PopoverContent>
        </Popover>
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
          className="flex-1 font-mono text-sm"
          placeholder={displayFormat === "hex" ? "#ff0000" : "255 0 0"}
          autoComplete="off"
          spellCheck={false}
        />
      </div>
    </div>
  );
};

const CollapsibleColorSection: React.FC<{
  category: string;
  colorData: ColorCategory;
  onColorChange: (
    category: string,
    type: "main" | "foreground",
    value: string,
  ) => void;
}> = ({ category, colorData, onColorChange }) => {
  const [isOpen, setIsOpen] = useState(false);

  // Get preview colors (always use hex for consistency)
  const mainPreview = oklchToDisplayColor(colorData.colors.main, "hex");
  const foregroundPreview = oklchToDisplayColor(
    colorData.colors.foreground,
    "hex",
  );

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button
          variant="ghost"
          className="mb-2 h-auto w-full justify-between rounded-lg border border-gray-100 p-4 transition-colors hover:bg-gray-50/80"
        >
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5">
              <div
                className="h-3 w-3 rounded-full border border-gray-200 shadow-sm"
                style={{ backgroundColor: mainPreview }}
              />
              <div
                className="h-3 w-3 rounded-full border border-gray-200 shadow-sm"
                style={{ backgroundColor: foregroundPreview }}
              />
            </div>
            <span className="text-sm font-medium text-gray-800">
              {colorData.name}
            </span>
          </div>
          <motion.div
            animate={{ rotate: isOpen ? 90 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronRight className="h-4 w-4 text-gray-400" />
          </motion.div>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 overflow-hidden">
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mx-2 mb-2 space-y-4 rounded-lg border border-gray-100 bg-gray-50/50 px-4 pb-4 pt-1"
        >
          <ColorPicker
            value={colorData.colors.main}
            onChange={(value) => onColorChange(category, "main", value)}
            label={`${colorData.name.replace(" Colors", "")}`}
          />
          <ColorPicker
            value={colorData.colors.foreground}
            onChange={(value) => onColorChange(category, "foreground", value)}
            label={`${colorData.name.replace(" Colors", "")} Foreground`}
          />
        </motion.div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default function ThemeDialog({
  open,
  onOpenChange,
  projectId,
}: ThemeDialogProps) {
  const [themeConfig, setThemeConfig] =
    useState<ThemeConfig>(DEFAULT_THEME_CONFIG);
  const [loading, setLoading] = useState(false);
  const [, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("colors");
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const updateTheme = useAction(api.codesandbox.updateProjectTheme.updateTheme);
  const getProjectThemeAction = useAction(
    api.codesandbox.getProjectTheme.getProjectTheme,
  );

  // Debounced save function
  const debouncedSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pendingSaveConfigRef = useRef<ThemeConfig | null>(null);

  const debouncedSave = useCallback(
    async (configToSave: ThemeConfig) => {
      // Clear any existing timeout
      if (debouncedSaveTimeoutRef.current) {
        clearTimeout(debouncedSaveTimeoutRef.current);
      }

      // Store the config to save
      pendingSaveConfigRef.current = configToSave;
      setHasUnsavedChanges(true);

      // Set up debounced save
      debouncedSaveTimeoutRef.current = setTimeout(async () => {
        if (pendingSaveConfigRef.current) {
          try {
            setIsSaving(true);
            setError(null);
            await updateTheme({
              projectId,
              themeConfig: pendingSaveConfigRef.current as any,
            });
            setHasUnsavedChanges(false);
            pendingSaveConfigRef.current = null;
          } catch (err) {
            console.error("Failed to auto-save theme:", err);
            setError("Failed to save theme changes.");
          } finally {
            setIsSaving(false);
          }
        }
      }, 1000); // Save after 1 second of no changes
    },
    [updateTheme, projectId],
  );

  // Load current theme when dialog opens
  useEffect(() => {
    if (open && projectId) {
      loadCurrentTheme();
      // Reset state when dialog opens
      setHasUnsavedChanges(false);
      setIsSaving(false);
      if (debouncedSaveTimeoutRef.current) {
        clearTimeout(debouncedSaveTimeoutRef.current);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, projectId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debouncedSaveTimeoutRef.current) {
        clearTimeout(debouncedSaveTimeoutRef.current);
      }
    };
  }, []);

  const loadCurrentTheme = async () => {
    try {
      setLoading(true);
      setError(null);
      const currentTheme = await getProjectThemeAction({ projectId });
      setThemeConfig(currentTheme as ThemeConfig);
    } catch (err) {
      console.error("Failed to load current theme:", err);
      setError("Failed to load current theme. Using default theme.");
      setThemeConfig(DEFAULT_THEME_CONFIG);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTheme = async () => {
    try {
      setLoading(true);
      setError(null);

      // Cancel any pending debounced save
      if (debouncedSaveTimeoutRef.current) {
        clearTimeout(debouncedSaveTimeoutRef.current);
      }

      // Save immediately when user clicks Save
      await updateTheme({
        projectId,
        themeConfig: themeConfig as any,
      });
      setHasUnsavedChanges(false);
      pendingSaveConfigRef.current = null;
      onOpenChange(false);
    } catch (err) {
      console.error("Failed to apply theme:", err);
      setError("Failed to apply theme. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleColorChange = useCallback(
    (category: string, type: "main" | "foreground", value: string) => {
      const newConfig = {
        ...themeConfig,
        colors: {
          ...themeConfig.colors,
          [category]: {
            ...themeConfig.colors[category],
            colors: {
              ...themeConfig.colors[category].colors,
              [type]: value,
            },
          },
        },
      };
      setThemeConfig(newConfig);
      debouncedSave(newConfig);
    },
    [themeConfig, debouncedSave],
  );

  const handleTypographyChange = useCallback(
    (key: keyof ThemeConfig["typography"], value: string | number) => {
      const newConfig = {
        ...themeConfig,
        typography: {
          ...themeConfig.typography,
          [key]: value,
        },
      };
      setThemeConfig(newConfig);
      debouncedSave(newConfig);
    },
    [themeConfig, debouncedSave],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden border border-gray-200 bg-white shadow-2xl backdrop-blur-md">
        <DialogHeader className="border-b pb-4">
          <DialogTitle className="flex items-center gap-3 text-xl font-semibold text-gray-900">
            <div className="rounded-lg bg-gradient-to-br from-purple-500 to-blue-600 p-2">
              <Palette className="h-5 w-5 text-white" />
            </div>
            Theme Customization
            {(isSaving || hasUnsavedChanges) && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {isSaving && (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-300 border-t-blue-500" />
                    Saving...
                  </>
                )}
                {!isSaving && hasUnsavedChanges && (
                  <>
                    <div className="h-2 w-2 rounded-full bg-orange-500" />
                    Unsaved changes
                  </>
                )}
              </div>
            )}
          </DialogTitle>
        </DialogHeader>

        <FeatureGate
          featureId="theme_customization"
          fallback={
            <div className="p-6">
              <UpgradePrompt
                featureId="theme_customization"
                title="Unlock Theme Customization with Scale Plan"
                message="Theme customization is available on Scale plan or higher. Upgrade to Scale plan to customize colors, fonts, and typography for your project."
              />
            </div>
          }
        >
          <Tabs
            value={activeTab}
            onValueChange={setActiveTab}
            className="flex-1"
          >
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="colors" className="flex items-center gap-2">
                <Palette className="h-4 w-4" />
                Colors
              </TabsTrigger>
              <TabsTrigger
                value="typography"
                className="flex items-center gap-2"
              >
                <Type className="h-4 w-4" />
                Typography
              </TabsTrigger>
            </TabsList>

            <TabsContent value="colors" className="mt-4 flex-1">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-2">
                  {Object.entries(themeConfig.colors).map(
                    ([category, colorData]) => (
                      <CollapsibleColorSection
                        key={category}
                        category={category}
                        colorData={colorData}
                        onColorChange={handleColorChange}
                      />
                    ),
                  )}
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="typography" className="mt-4 flex-1">
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-6">
                  <div className="space-y-4">
                    <Label className="text-lg font-semibold">Font Family</Label>

                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm font-medium">
                          Sans-Serif Font
                        </Label>
                        <FontSelector
                          value={themeConfig.typography.fontSans}
                          onValueChange={(value) =>
                            handleTypographyChange("fontSans", value)
                          }
                          category="sans-serif"
                          placeholder="Select sans-serif font..."
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium">
                          Serif Font
                        </Label>
                        <FontSelector
                          value={themeConfig.typography.fontSerif}
                          onValueChange={(value) =>
                            handleTypographyChange("fontSerif", value)
                          }
                          category="serif"
                          placeholder="Select serif font..."
                        />
                      </div>

                      <div>
                        <Label className="text-sm font-medium">
                          Monospace Font
                        </Label>
                        <FontSelector
                          value={themeConfig.typography.fontMono}
                          onValueChange={(value) =>
                            handleTypographyChange("fontMono", value)
                          }
                          category="monospace"
                          placeholder="Select monospace font..."
                        />
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-4">
                    <Label className="text-lg font-semibold">
                      Letter Spacing
                    </Label>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm">Letter Spacing</Label>
                        <span className="text-sm text-gray-500">
                          {themeConfig.typography.letterSpacing}em
                        </span>
                      </div>
                      <Slider
                        value={[themeConfig.typography.letterSpacing]}
                        onValueChange={([value]) =>
                          handleTypographyChange("letterSpacing", value)
                        }
                        min={-0.1}
                        max={0.3}
                        step={0.01}
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleApplyTheme} disabled={loading || isSaving}>
              {loading || isSaving ? "Saving..." : "Save Theme"}
            </Button>
          </div>
        </FeatureGate>
      </DialogContent>
    </Dialog>
  );
}

// Named export for compatibility
export { ThemeDialog };
