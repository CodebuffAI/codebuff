import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import { Check, Search, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getFontsByCategory,
  searchFonts,
  GOOGLE_FONTS,
  SYSTEM_FONTS,
} from "@/lib/googleFonts";

interface FontSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  category: "sans-serif" | "serif" | "monospace";
  placeholder?: string;
}

export function FontSelector({
  value,
  onValueChange,
  category,
  placeholder = "Select font...",
}: FontSelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [loadedFonts, setLoadedFonts] = useState<Set<string>>(new Set());
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Get fonts for this category
  const availableFonts = useMemo(() => {
    return searchFonts(searchQuery, category);
  }, [searchQuery, category]);

  // Enhanced font loading with proper promise handling
  const loadFont = useCallback(
    async (fontFamily: string): Promise<void> => {
      if (loadedFonts.has(fontFamily)) return;

      // System fonts don't need loading
      const isSystemFont = SYSTEM_FONTS.some((f) => f.family === fontFamily);
      if (isSystemFont) {
        setLoadedFonts((prev) => new Set([...prev, fontFamily]));
        return;
      }

      // For Google Fonts, create a proper loading promise
      const isGoogleFont = GOOGLE_FONTS.some((f) => f.family === fontFamily);
      if (isGoogleFont) {
        return new Promise<void>((resolve) => {
          const url = `https://fonts.googleapis.com/css2?family=${fontFamily.replace(/\s+/g, "+")}:wght@400;500;600;700&display=swap`;

          // Check if already loaded
          const existingLink = document.querySelector(`link[href="${url}"]`);
          if (existingLink) {
            setLoadedFonts((prev) => new Set([...prev, fontFamily]));
            resolve();
            return;
          }

          // Create link element with proper loading handling
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = url;

          link.onload = () => {
            setLoadedFonts((prev) => new Set([...prev, fontFamily]));
            resolve();
          };

          link.onerror = () => {
            console.warn(`Failed to load font: ${fontFamily}`);
            resolve(); // Resolve anyway to not block the UI
          };

          document.head.appendChild(link);
        });
      }
    },
    [loadedFonts],
  );

  // Preload font when selected
  useEffect(() => {
    if (value && !loadedFonts.has(value)) {
      loadFont(value);
    }
  }, [value, loadedFonts, loadFont]);

  // Initialize system fonts as loaded on mount
  useEffect(() => {
    const systemFonts = getFontsByCategory(category)
      .filter((f) => SYSTEM_FONTS.some((sf) => sf.family === f.family))
      .map((f) => f.family);

    if (systemFonts.length > 0) {
      setLoadedFonts((prev) => new Set([...prev, ...systemFonts]));
    }
  }, [category]);

  // Preload popular Google fonts on mount
  useEffect(() => {
    const popularGoogleFonts = getFontsByCategory(category)
      .filter(
        (f) =>
          f.popularity &&
          f.popularity <= 5 &&
          GOOGLE_FONTS.some((gf) => gf.family === f.family),
      )
      .map((f) => f.family);

    popularGoogleFonts.forEach((font) => {
      loadFont(font);
    });
  }, [category, loadFont]);

  // Handle clicks outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

  const handleFontSelect = (fontFamily: string) => {
    onValueChange(fontFamily);
    setOpen(false);
    setSearchQuery("");

    // Load the font if not already loaded
    if (!loadedFonts.has(fontFamily)) {
      loadFont(fontFamily);
    }
  };

  const getFontStyle = (fontFamily: string): React.CSSProperties => {
    const isGoogleFont = GOOGLE_FONTS.some((f) => f.family === fontFamily);
    const isSystemFont = SYSTEM_FONTS.some((f) => f.family === fontFamily);
    const isLoaded = loadedFonts.has(fontFamily);

    // For system fonts, always use them directly
    if (isSystemFont) {
      return {
        fontFamily: fontFamily,
      };
    }

    // For Google fonts, only use them if loaded, otherwise fallback to category
    if (isGoogleFont) {
      return {
        fontFamily: isLoaded ? `"${fontFamily}", ${category}` : category,
      };
    }

    // For other fonts, use as-is
    return {
      fontFamily: fontFamily,
    };
  };

  return (
    <div className="relative w-full">
      <Button
        ref={buttonRef}
        variant="outline"
        role="combobox"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="w-full justify-between font-normal"
        style={value ? getFontStyle(value) : {}}
      >
        {value || placeholder}
        <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
      </Button>

      {open && (
        <div
          ref={dropdownRef}
          className="absolute left-0 right-0 top-full z-50 mt-1 rounded-md border border-border bg-popover text-popover-foreground shadow-md"
          style={{ maxHeight: "320px" }}
        >
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder={`Search ${category} fonts...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>

          <div
            className="overflow-y-auto overflow-x-hidden"
            style={{ maxHeight: "260px" }}
          >
            {availableFonts.length === 0 ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No fonts found.
              </div>
            ) : (
              availableFonts.map((font) => (
                <div
                  key={font.family}
                  onClick={() => handleFontSelect(font.family)}
                  className="flex cursor-pointer items-center justify-between border-b border-border/50 p-3 last:border-b-0 hover:bg-accent hover:text-accent-foreground"
                >
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div
                      className="truncate text-sm font-medium"
                      style={getFontStyle(font.family)}
                    >
                      {font.family}
                    </div>
                    <div
                      className="truncate text-xs text-muted-foreground"
                      style={getFontStyle(font.family)}
                    >
                      The quick brown fox jumps over the lazy dog
                    </div>
                  </div>
                  <Check
                    className={cn(
                      "ml-2 h-4 w-4 flex-shrink-0",
                      value === font.family ? "opacity-100" : "opacity-0",
                    )}
                  />
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
