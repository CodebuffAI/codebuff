import type { ThemeName } from "@/lib/theme-prompts";

export type ThemePreviewStyle =
  | "minimal"
  | "modern"
  | "neobrutal"
  | "papery"
  | "notebook"
  | "studio"
  | "clay"
  | "vintage"
  | "glass"
  | "terminal";

export interface ThemeMetadata {
  name: ThemeName;
  colors: {
    primary: string;
    secondary: string;
    accent?: string;
    background: string;
    text: string;
  };
  icon: string;
  tags: string[];
  font: string;
  vibe: string;
  description: string;
  previewStyle: ThemePreviewStyle;
  borderStyle?: string;
  shadowStyle?: string;
}

const metadataByTheme = {
  Minimalism: {
    name: "Minimalism",
    colors: {
      primary: "#111111",
      secondary: "#737373",
      accent: "#E7E5E4",
      background: "#FFFFFF",
      text: "#111111",
    },
    icon: "○",
    tags: ["Quiet", "Precise", "Whitespace"],
    font: "Inter",
    vibe: "Clean essentials",
    description:
      "Quiet monochrome layouts with sharp spacing and restrained detail.",
    previewStyle: "minimal",
    borderStyle: "1px solid rgba(17, 17, 17, 0.08)",
    shadowStyle: "0 18px 40px rgba(15, 23, 42, 0.06)",
  },
  Modern: {
    name: "Modern",
    colors: {
      primary: "#2D6BFF",
      secondary: "#8AA3D4",
      accent: "#5FD2FF",
      background: "linear-gradient(135deg, #F8FBFF 0%, #EEF3FF 100%)",
      text: "#10213A",
    },
    icon: "◇",
    tags: ["Product", "Polished", "Airy"],
    font: "Inter",
    vibe: "Crisp product polish",
    description:
      "Layered, contemporary UI with refined contrast and calm color.",
    previewStyle: "modern",
    borderStyle: "1px solid rgba(45, 107, 255, 0.12)",
    shadowStyle: "0 20px 45px rgba(45, 107, 255, 0.12)",
  },
  "Neobrutalism Minimalism": {
    name: "Neobrutalism Minimalism",
    colors: {
      primary: "#FF6B2C",
      secondary: "#FFE76A",
      accent: "#111111",
      background: "#F7F4EC",
      text: "#111111",
    },
    icon: "▣",
    tags: ["Square", "Bold", "Consistent"],
    font: "Space Grotesk",
    vibe: "Hard edges, controlled palette",
    description:
      "Bold borders and flat blocks, but with disciplined minimal structure.",
    previewStyle: "neobrutal",
    borderStyle: "3px solid #111111",
    shadowStyle: "6px 6px 0px #111111",
  },
  Papery: {
    name: "Papery",
    colors: {
      primary: "#2F241A",
      secondary: "#8A7B67",
      accent: "#B04A2B",
      background: "#F0EEE6",
      text: "#1F1A14",
    },
    icon: "▤",
    tags: ["Editorial", "Paper", "Newsprint"],
    font: "Playfair Display",
    vibe: "Newsroom minimalism",
    description:
      "Paper-toned editorial UI with thin rules, columns, and serif calm.",
    previewStyle: "papery",
    borderStyle: "1px solid rgba(47, 36, 26, 0.14)",
    shadowStyle: "0 12px 24px rgba(47, 36, 26, 0.08)",
  },
  Notebook: {
    name: "Notebook",
    colors: {
      primary: "#1D4ED8",
      secondary: "#E06C75",
      accent: "#5B8A72",
      background: "#F7F3E9",
      text: "#2D2A24",
    },
    icon: "☰",
    tags: ["Textured", "Ruled", "Organized"],
    font: "Roboto",
    vibe: "Lined and hand-kept",
    description: "Ruled paper, margin lines, and textured note-taking energy.",
    previewStyle: "notebook",
    borderStyle: "1px solid rgba(45, 42, 36, 0.12)",
    shadowStyle: "0 14px 24px rgba(61, 56, 48, 0.08)",
  },
  Studio: {
    name: "Studio",
    colors: {
      primary: "#1F2937",
      secondary: "#9AA4B2",
      accent: "#D6BFA3",
      background: "#FCFBF7",
      text: "#111827",
    },
    icon: "▢",
    tags: ["Gallery", "Quiet", "Refined"],
    font: "Inter",
    vibe: "Soft modern editorial",
    description:
      "Warm-white, gallery-clean layouts with thin framing and airy balance.",
    previewStyle: "studio",
    borderStyle: "1px solid rgba(17, 24, 39, 0.08)",
    shadowStyle: "0 18px 36px rgba(17, 24, 39, 0.06)",
  },
  Claymorphism: {
    name: "Claymorphism",
    colors: {
      primary: "#F28E6B",
      secondary: "#F7C7B7",
      accent: "#8C73FF",
      background: "linear-gradient(135deg, #FBE7DE 0%, #F4EEFF 100%)",
      text: "#5C4667",
    },
    icon: "⬤",
    tags: ["Tactile", "Rounded", "Matte"],
    font: "Inter",
    vibe: "Soft surfaces",
    description:
      "Inflated cards, plush shadows, and rounded matte pastel shapes.",
    previewStyle: "clay",
    shadowStyle:
      "12px 12px 24px rgba(214, 156, 138, 0.25), -10px -10px 24px rgba(255, 255, 255, 0.7)",
  },
  Vintage: {
    name: "Vintage",
    colors: {
      primary: "#6C4C2C",
      secondary: "#B99368",
      accent: "#8F2D2D",
      background: "#E6D7BD",
      text: "#3A2816",
    },
    icon: "◫",
    tags: ["Sepia", "Printed", "Warm"],
    font: "Playfair Display",
    vibe: "Aged and elegant",
    description:
      "Archival warmth with sepia contrast, serif hierarchy, and quiet texture.",
    previewStyle: "vintage",
    borderStyle: "1px solid rgba(108, 76, 44, 0.22)",
    shadowStyle: "0 14px 28px rgba(58, 40, 22, 0.12)",
  },
  Glassmorphism: {
    name: "Glassmorphism",
    colors: {
      primary: "#8FE7FF",
      secondary: "#B39DFF",
      accent: "#FF9ECD",
      background:
        "linear-gradient(135deg, #0F172A 0%, #1D4ED8 45%, #7C3AED 100%)",
      text: "#F8FAFC",
    },
    icon: "◌",
    tags: ["Frosted", "Layered", "Luminous"],
    font: "Inter",
    vibe: "Refined translucent depth",
    description:
      "A cleaner glass UI with better hierarchy, subtle blur, and controlled glow.",
    previewStyle: "glass",
    borderStyle: "1px solid rgba(255, 255, 255, 0.22)",
    shadowStyle:
      "0 20px 48px rgba(15, 23, 42, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.25)",
  },
  Terminal: {
    name: "Terminal",
    colors: {
      primary: "#7CFF9B",
      secondary: "#31D0AA",
      accent: "#F9D66B",
      background: "#08110D",
      text: "#C9FFD6",
    },
    icon: ">_",
    tags: ["Monospace", "CLI", "Grid"],
    font: "JetBrains Mono",
    vibe: "Command-line precision",
    description:
      "Dark terminal framing with monospace alignment, status bars, and glow.",
    previewStyle: "terminal",
    borderStyle: "1px solid rgba(124, 255, 155, 0.18)",
    shadowStyle: "0 0 24px rgba(124, 255, 155, 0.14)",
  },
} satisfies Record<ThemeName, ThemeMetadata>;

export const themeMetadata: Record<string, ThemeMetadata> = metadataByTheme;
