interface ThemeConfig {
  colors: {
    [key: string]: {
      name: string;
      colors: {
        main: string;
        foreground: string;
      };
    };
  };
  typography: {
    fontSans: string;
    fontSerif: string;
    fontMono: string;
    letterSpacing: number;
  };
}

// Consolidated Google Fonts list (single source of truth)
const GOOGLE_FONTS_LIST = [
  "Inter",
  "Roboto",
  "Open Sans",
  "Poppins",
  "Nunito",
  "Lato",
  "Montserrat",
  "Playfair Display",
  "Merriweather",
  "Lora",
  "Crimson Text",
  "Source Serif Pro",
  "Libre Baskerville",
  "Cormorant Garamond",
  "EB Garamond",
  "Noto Serif",
  "PT Serif",
  "JetBrains Mono",
  "Fira Code",
  "Roboto Mono",
  "Source Code Pro",
  "Space Mono",
  "Inconsolata",
  "Courier Prime",
  "IBM Plex Mono",
  "Noto Sans Mono",
  "Ubuntu Mono",
  "Source Sans Pro",
  "Ubuntu",
  "Raleway",
  "Work Sans",
  "Noto Sans",
  "Fira Sans",
  "DM Sans",
  "Rubik",
];

// Single function to generate font imports
export function generateFontImports(
  typography: ThemeConfig["typography"],
): string {
  const imports: string[] = [];

  const fontsToImport = [
    typography.fontSans,
    typography.fontSerif,
    typography.fontMono,
  ].filter((font) => GOOGLE_FONTS_LIST.includes(font));

  if (fontsToImport.length > 0) {
    // Create proper Google Fonts URL with weights
    const fontFamilies = fontsToImport
      .map((font) => {
        // Convert font name to URL format and add weights
        const fontName = font.replace(/\s+/g, "+");
        return `family=${fontName}:wght@100;200;300;400;500;600;700;800;900`;
      })
      .join("&");

    const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontFamilies}&display=swap`;
    imports.push(`@import url('${googleFontsUrl}');`);
  }

  return imports.join("\n");
}

// Single function to generate complete CSS (consolidates generateIndexCSS and generateThemeCSS)
export function generateThemeCSS(themeConfig: ThemeConfig): string {
  const { colors, typography } = themeConfig;

  // Generate font imports if using custom fonts
  const fontImports = generateFontImports(typography);

  return `/* FONT IMPORTS GO HERE */
${fontImports}

/* DO NOT CHANGE */
@import "tailwindcss";
@import "tw-animate-css";
@custom-variant dark (&:is(.dark *));

/* DO NOT CHANGE */
@theme inline {
  --radius-sm: calc(var(--radius) - 4px);
  --radius-md: calc(var(--radius) - 2px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 4px);
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-popover: var(--popover);
  --color-popover-foreground: var(--popover-foreground);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--primary-foreground);
  --color-secondary: var(--secondary);
  --color-secondary-foreground: var(--secondary-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-accent: var(--accent);
  --color-accent-foreground: var(--accent-foreground);
  --color-destructive: var(--destructive);
  --color-border: var(--border);
  --color-input: var(--input);
  --color-ring: var(--ring);
  --color-chart-1: var(--chart-1);
  --color-chart-2: var(--chart-2);
  --color-chart-3: var(--chart-3);
  --color-chart-4: var(--chart-4);
  --color-chart-5: var(--chart-5);
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-primary-foreground: var(--sidebar-primary-foreground);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-accent-foreground: var(--sidebar-accent-foreground);
  --color-sidebar-border: var(--sidebar-border);
  --color-sidebar-ring: var(--sidebar-ring);
}

/* CHANGE VALUES FOR THEME */
:root {
  --radius: 0.625rem;
  --background: ${colors.base.colors.main};
  --foreground: ${colors.base.colors.foreground};
  --card: ${colors.card.colors.main};
  --card-foreground: ${colors.card.colors.foreground};
  --popover: ${colors.popover.colors.main};
  --popover-foreground: ${colors.popover.colors.foreground};
  --primary: ${colors.primary.colors.main};
  --primary-foreground: ${colors.primary.colors.foreground};
  --secondary: ${colors.secondary.colors.main};
  --secondary-foreground: ${colors.secondary.colors.foreground};
  --muted: ${colors.muted.colors.main};
  --muted-foreground: ${colors.muted.colors.foreground};
  --accent: ${colors.accent.colors.main};
  --accent-foreground: ${colors.accent.colors.foreground};
  --destructive: ${colors.destructive.colors.main};
  --border: ${colors.border.colors.main};
  --input: ${colors.border.colors.main};
  --ring: ${colors.border.colors.foreground};
  --chart-1: ${colors.chart.colors.main};
  --chart-2: ${colors.chart.colors.foreground};
  --chart-3: oklch(0.398 0.07 227.392);
  --chart-4: oklch(0.828 0.189 84.429);
  --chart-5: oklch(0.769 0.188 70.08);
  --sidebar: ${colors.sidebar.colors.main};
  --sidebar-foreground: ${colors.sidebar.colors.foreground};
  --sidebar-primary: ${colors.primary.colors.main};
  --sidebar-primary-foreground: ${colors.primary.colors.foreground};
  --sidebar-accent: ${colors.secondary.colors.main};
  --sidebar-accent-foreground: ${colors.secondary.colors.foreground};
  --sidebar-border: ${colors.border.colors.main};
  --sidebar-ring: ${colors.border.colors.foreground};
}

.dark {
  --background: oklch(0.145 0 0);
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);
  --card-foreground: oklch(0.985 0 0);
  --popover: oklch(0.205 0 0);
  --popover-foreground: oklch(0.985 0 0);
  --primary: oklch(0.922 0 0);
  --primary-foreground: oklch(0.205 0 0);
  --secondary: oklch(0.269 0 0);
  --secondary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.269 0 0);
  --accent-foreground: oklch(0.985 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);
  --input: oklch(1 0 0 / 15%);
  --ring: oklch(0.556 0 0);
  --chart-1: oklch(0.488 0.243 264.376);
  --chart-2: oklch(0.696 0.17 162.48);
  --chart-3: oklch(0.769 0.188 70.08);
  --chart-4: oklch(0.627 0.265 303.9);
  --chart-5: oklch(0.645 0.246 16.439);
  --sidebar: oklch(0.205 0 0);
  --sidebar-foreground: oklch(0.985 0 0);
  --sidebar-primary: oklch(0.488 0.243 264.376);
  --sidebar-primary-foreground: oklch(0.985 0 0);
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-accent-foreground: oklch(0.985 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --sidebar-ring: oklch(0.556 0 0);
}

@layer base {
  * {
    @apply border-border outline-ring/50;
    letter-spacing: ${typography.letterSpacing}em;
  }
  body {
    @apply bg-background text-foreground;
    font-family: ${typography.fontSans}, system-ui, sans-serif;
  }
  .font-sans {
    font-family: ${typography.fontSans}, system-ui, sans-serif;
  }
  .font-serif {
    font-family: ${typography.fontSerif}, Georgia, serif;
  }
  .font-mono {
    font-family: ${typography.fontMono}, "Courier New", monospace;
  }
}
`;
}

// Default theme configuration (single source of truth)
export const DEFAULT_THEME_CONFIG: ThemeConfig = {
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

// Export the consolidated Google Fonts list
export { GOOGLE_FONTS_LIST };
export type { ThemeConfig };
