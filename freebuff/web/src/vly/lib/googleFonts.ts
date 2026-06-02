// Google Fonts integration
export interface GoogleFont {
  family: string;
  variants: string[];
  subsets: string[];
  category: "sans-serif" | "serif" | "monospace" | "display" | "handwriting";
  popularity?: number;
}

// Curated list of reliable Google Fonts (5-7 per category)
export const GOOGLE_FONTS: GoogleFont[] = [
  // Sans-serif fonts (most popular and reliable)
  {
    family: "Inter",
    variants: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
    subsets: ["latin"],
    category: "sans-serif",
    popularity: 1,
  },
  {
    family: "Roboto",
    variants: ["100", "300", "400", "500", "700", "900"],
    subsets: ["latin"],
    category: "sans-serif",
    popularity: 2,
  },
  {
    family: "Open Sans",
    variants: ["300", "400", "500", "600", "700", "800"],
    subsets: ["latin"],
    category: "sans-serif",
    popularity: 3,
  },
  {
    family: "Poppins",
    variants: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
    subsets: ["latin"],
    category: "sans-serif",
    popularity: 4,
  },
  {
    family: "Montserrat",
    variants: ["100", "200", "300", "400", "500", "600", "700", "800", "900"],
    subsets: ["latin"],
    category: "sans-serif",
    popularity: 5,
  },
  {
    family: "Lato",
    variants: ["100", "300", "400", "700", "900"],
    subsets: ["latin"],
    category: "sans-serif",
    popularity: 6,
  },

  // Serif fonts (most popular and reliable)
  {
    family: "Playfair Display",
    variants: ["400", "500", "600", "700", "800", "900"],
    subsets: ["latin"],
    category: "serif",
    popularity: 1,
  },
  {
    family: "Merriweather",
    variants: ["300", "400", "700", "900"],
    subsets: ["latin"],
    category: "serif",
    popularity: 2,
  },
  {
    family: "Lora",
    variants: ["400", "500", "600", "700"],
    subsets: ["latin"],
    category: "serif",
    popularity: 3,
  },
  {
    family: "Source Serif Pro",
    variants: ["200", "300", "400", "600", "700", "900"],
    subsets: ["latin"],
    category: "serif",
    popularity: 4,
  },
  {
    family: "Libre Baskerville",
    variants: ["400", "700"],
    subsets: ["latin"],
    category: "serif",
    popularity: 5,
  },
  {
    family: "Crimson Text",
    variants: ["400", "600", "700"],
    subsets: ["latin"],
    category: "serif",
    popularity: 6,
  },

  // Monospace fonts (most popular and reliable)
  {
    family: "JetBrains Mono",
    variants: ["100", "200", "300", "400", "500", "600", "700", "800"],
    subsets: ["latin"],
    category: "monospace",
    popularity: 1,
  },
  {
    family: "Fira Code",
    variants: ["300", "400", "500", "600", "700"],
    subsets: ["latin"],
    category: "monospace",
    popularity: 2,
  },
  {
    family: "Roboto Mono",
    variants: ["100", "200", "300", "400", "500", "600", "700"],
    subsets: ["latin"],
    category: "monospace",
    popularity: 3,
  },
  {
    family: "Source Code Pro",
    variants: ["200", "300", "400", "500", "600", "700", "800", "900"],
    subsets: ["latin"],
    category: "monospace",
    popularity: 4,
  },
  {
    family: "Space Mono",
    variants: ["400", "700"],
    subsets: ["latin"],
    category: "monospace",
    popularity: 5,
  },
];

// System fonts that don't need Google Fonts
export const SYSTEM_FONTS: GoogleFont[] = [
  {
    family: "system-ui",
    variants: ["400"],
    subsets: ["latin"],
    category: "sans-serif",
  },
  {
    family: "BlinkMacSystemFont",
    variants: ["400"],
    subsets: ["latin"],
    category: "sans-serif",
  },
  {
    family: "Helvetica Neue",
    variants: ["400"],
    subsets: ["latin"],
    category: "sans-serif",
  },
  {
    family: "Arial",
    variants: ["400"],
    subsets: ["latin"],
    category: "sans-serif",
  },
  {
    family: "Georgia",
    variants: ["400"],
    subsets: ["latin"],
    category: "serif",
  },
  {
    family: "Times New Roman",
    variants: ["400"],
    subsets: ["latin"],
    category: "serif",
  },
  {
    family: "Menlo",
    variants: ["400"],
    subsets: ["latin"],
    category: "monospace",
  },
  {
    family: "Monaco",
    variants: ["400"],
    subsets: ["latin"],
    category: "monospace",
  },
];

export function getAllFonts(): GoogleFont[] {
  return [...SYSTEM_FONTS, ...GOOGLE_FONTS];
}

export function getFontsByCategory(
  category: GoogleFont["category"],
): GoogleFont[] {
  return getAllFonts().filter((font) => font.category === category);
}

export function searchFonts(
  query: string,
  category?: GoogleFont["category"],
): GoogleFont[] {
  const fonts = category ? getFontsByCategory(category) : getAllFonts();
  if (!query.trim()) return fonts;

  return fonts.filter((font) =>
    font.family.toLowerCase().includes(query.toLowerCase()),
  );
}

export function preloadFont(fontFamily: string): void {
  if (typeof window === "undefined") return;

  const font = GOOGLE_FONTS.find((f) => f.family === fontFamily);
  if (!font) return;

  // Use the consolidated font generation logic from themeUtils
  // This avoids duplicating the Google Fonts URL generation logic
  const fontName = fontFamily.replace(/\s+/g, "+");
  const url = `https://fonts.googleapis.com/css2?family=${fontName}:wght@100;200;300;400;500;600;700;800;900&display=swap`;

  // Check if already loaded
  const existingLink = document.querySelector(`link[href="${url}"]`);
  if (existingLink) return;

  // Create link element
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = url;
  link.onload = () => {
    console.log(`Font ${fontFamily} loaded successfully`);
  };

  document.head.appendChild(link);
}
