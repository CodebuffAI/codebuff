export const featuredThemes = [
  "Minimalism",
  "Modern",
  "Neobrutalism Minimalism",
] as const;

export const themes = [
  ...featuredThemes,
  "Papery",
  "Notebook",
  "Studio",
  "Claymorphism",
  "Vintage",
  "Glassmorphism",
  "Terminal",
] as const;

export type ThemeName = (typeof themes)[number];

const themeNameSet = new Set<string>(themes);

export function isThemeName(theme: string): theme is ThemeName {
  return themeNameSet.has(theme);
}

export const themePrompts = {
  Minimalism:
    "Use a Minimalism theme when styling. Keep it clean, spacious, restrained, and highly legible with a near-monochrome palette, precise alignment, subtle dividers, and very intentional use of white space.",
  Modern:
    "Use a Modern theme when styling. Aim for a polished product-design look with crisp typography, quiet neutrals, refined accent color, soft layered cards, and balanced contemporary spacing.",
  "Neobrutalism Minimalism":
    "Use a Neobrutalism Minimalism theme when styling. Keep square corners, consistent minimalist structure, strong black borders, flat color blocking, and bold but controlled contrast without visual clutter.",
  Papery:
    "Use a Papery theme when styling. The background should feel like paper with a base of #F0EEE6, inspired by newspapers and editorial layouts with thin rules, serif-forward hierarchy, lots of breathing room, and quiet ink-like accents.",
  Notebook:
    "Use a Notebook theme when styling. Add a textured paper feel with subtle grain, ruled or margin-line details, organized list layouts, lightweight annotation accents, and a clean notebook-inspired composition.",
  Studio:
    "Use a Studio theme when styling. Keep it gallery-clean and refined with warm off-whites, thin framing, muted neutrals, careful spacing, and a soft editorial presentation.",
  Claymorphism:
    "Use a Claymorphism theme when styling. Make the interface feel tactile and soft with plush rounded surfaces, matte pastel colors, inflated shadows, and playful but polished depth.",
  Vintage:
    "Use a Vintage theme when styling. Use muted sepia and aged-paper tones, elegant serif hierarchy, light distressing or texture, and tasteful archival details rather than loud retro gimmicks.",
  Glassmorphism:
    "Use a Glassmorphism theme when styling. Make it better than a generic frosted card look by using refined hierarchy, layered translucent panels, controlled blur, subtle edge highlights, and restrained luminous color.",
  Terminal:
    "Use a Terminal theme when styling. Lean into monospace typography, command-line structure, aligned grid layouts, scanline or monitor hints, and green or amber accents on a dark interface.",
} as const satisfies Record<ThemeName, string>;
