/**
 * Theme Configuration System
 *
 * Tailwind-inspired theme configuration that allows components to use different
 * theme variants (transparent, modal, embedded, custom) while maintaining the
 * automatic light/dark mode detection.
 */

import type { ChatTheme } from './theme-system'

/**
 * Theme variant types for different component use cases
 * - transparent: Default transparent backgrounds (terminal shows through)
 * - modal: Solid backgrounds for overlay components like LoginModal
 * - embedded: For future embedded views that need controlled backgrounds
 * - custom: User-defined custom variant
 */
export type ThemeVariant = 'transparent' | 'modal' | 'embedded' | 'custom'

/**
 * Background color configuration for a theme variant
 * Use 'auto' to automatically use #ffffff (light mode) or #000000 (dark mode)
 * Use 'transparent' to keep transparent
 * Use a hex color string for custom colors
 */
export type BackgroundColor = 'auto' | 'transparent' | string

/**
 * Configuration for background colors in a theme variant
 */
export interface ThemeVariantBackgrounds {
  /** Main background color (replaces theme.background) */
  main?: BackgroundColor
  /** Chrome background color (replaces theme.chromeBg) */
  chrome?: BackgroundColor
  /** Panel background color (replaces theme.panelBg) */
  panel?: BackgroundColor
  /** Message background color (replaces theme.messageBg) */
  message?: BackgroundColor
  /** Input background color (replaces theme.inputBg) */
  input?: BackgroundColor
  /** Focused input background color (replaces theme.inputFocusedBg) */
  inputFocused?: BackgroundColor
  /** Agent content background color (replaces theme.agentContentBg) */
  agent?: BackgroundColor
  /** Accent background color (replaces theme.accentBg) */
  accent?: BackgroundColor
  /** Agent focused background (replaces theme.agentFocusedBg) */
  agentFocused?: BackgroundColor
  /** Agent toggle header background (replaces theme.agentToggleHeaderBg) */
  agentToggleHeader?: BackgroundColor
  /** Agent toggle expanded background (replaces theme.agentToggleExpandedBg) */
  agentToggleExpanded?: BackgroundColor
  /** Markdown code background (replaces theme.markdown?.codeBackground) */
  markdownCode?: BackgroundColor
}

/**
 * Configuration for a single theme variant
 */
export interface ThemeVariantConfig {
  /** Background color overrides */
  backgrounds?: ThemeVariantBackgrounds
  /** Additional theme property overrides */
  overrides?: Partial<ChatTheme>
}

/**
 * Plugin interface for extending theme system
 * Plugins can modify themes at runtime
 */
export interface ThemePlugin {
  /** Unique plugin name */
  name: string
  /**
   * Apply plugin modifications to a theme
   * @param theme - The base theme
   * @param variant - The current variant being built
   * @param mode - The detected light/dark mode
   * @returns Partial theme to merge
   */
  apply: (
    theme: ChatTheme,
    variant: ThemeVariant,
    mode: 'dark' | 'light',
  ) => Partial<ChatTheme>
}

/**
 * Main theme configuration interface
 */
export interface ThemeConfig {
  /** Built-in theme variants */
  variants: Record<ThemeVariant, ThemeVariantConfig>
  /** Global color overrides applied to all variants */
  customColors?: Partial<ChatTheme>
  /** Registered plugins for theme extensions */
  plugins?: ThemePlugin[]
}

/**
 * Default theme configuration
 * This is the base configuration that can be extended by users
 */
export const defaultThemeConfig: ThemeConfig = {
  variants: {
    /**
     * Transparent variant (default)
     * All backgrounds are transparent, terminal background shows through
     * This is the current default behavior
     */
    transparent: {
      backgrounds: {
        // All backgrounds remain transparent (no overrides)
      },
    },

    /**
     * Modal variant
     * Solid backgrounds for overlay components
     * Use 'auto' to get white in light mode, black in dark mode
     */
    modal: {
      backgrounds: {
        main: 'auto',
        chrome: 'auto',
        panel: 'auto',
        message: 'auto',
        input: 'auto',
        inputFocused: 'auto',
        agent: 'auto',
        accent: 'auto',
        agentFocused: 'auto',
        agentToggleHeader: 'auto',
        markdownCode: 'auto',
      },
    },

    /**
     * Embedded variant
     * For future embedded views that need controlled backgrounds
     * Similar to modal but with more selective solid backgrounds
     */
    embedded: {
      backgrounds: {
        main: 'auto',
        chrome: 'auto',
        panel: 'auto',
      },
    },

    /**
     * Custom variant
     * Placeholder for user-defined custom themes
     * Can be overridden via customColors in ThemeConfig
     */
    custom: {
      backgrounds: {},
    },
  },

  // Global overrides (applied to all variants)
  customColors: {},

  // Plugins (empty by default)
  plugins: [],
}

/**
 * Active theme configuration
 * Can be modified at runtime for customization
 */
export let themeConfig: ThemeConfig = defaultThemeConfig

/**
 * Update the active theme configuration
 * @param config - New configuration (will be merged with defaults)
 */
export const setThemeConfig = (config: Partial<ThemeConfig>): void => {
  themeConfig = {
    ...defaultThemeConfig,
    ...config,
    variants: {
      ...defaultThemeConfig.variants,
      ...config.variants,
    },
    plugins: [...(defaultThemeConfig.plugins ?? []), ...(config.plugins ?? [])],
  }
}

/**
 * Register a theme plugin
 * @param plugin - Plugin to register
 */
export const registerThemePlugin = (plugin: ThemePlugin): void => {
  if (!themeConfig.plugins) {
    themeConfig.plugins = []
  }
  // Check if plugin already registered
  if (themeConfig.plugins.some((p) => p.name === plugin.name)) {
    console.warn(`Theme plugin "${plugin.name}" is already registered`)
    return
  }
  themeConfig.plugins.push(plugin)
}

/**
 * Get configuration for a specific variant
 * @param variant - The variant to get config for
 * @returns The variant configuration
 */
export const getVariantConfig = (variant: ThemeVariant): ThemeVariantConfig => {
  return themeConfig.variants[variant] ?? themeConfig.variants.transparent
}

/**
 * Resolve a background color based on mode
 * Converts 'auto' to white (light) or black (dark)
 * @param color - Background color specification
 * @param mode - Current theme mode (dark or light)
 * @returns Resolved color string
 */
export const resolveBackgroundColor = (
  color: BackgroundColor | undefined,
  mode: 'dark' | 'light',
): string | undefined => {
  if (!color) return undefined
  if (color === 'transparent') return 'transparent'
  if (color === 'auto') {
    return mode === 'dark' ? '#000000' : '#ffffff'
  }
  return color
}

/**
 * Mapping of theme properties to their corresponding background config keys
 * Makes it easy to apply all background overrides without repetition
 */
const BACKGROUND_PROPERTY_MAPPING: Array<
  [keyof ChatTheme, keyof ThemeVariantBackgrounds]
> = [
  ['background', 'main'],
  ['chromeBg', 'chrome'],
  ['panelBg', 'panel'],
  ['messageBg', 'message'],
  ['inputBg', 'input'],
  ['inputFocusedBg', 'inputFocused'],
  ['agentContentBg', 'agent'],
  ['accentBg', 'accent'],
  ['agentFocusedBg', 'agentFocused'],
  ['agentToggleHeaderBg', 'agentToggleHeader'],
  ['agentToggleExpandedBg', 'agentToggleExpanded'],
]

/**
 * Apply variant background overrides to a theme
 * Resolves all 'auto' values based on the current light/dark mode
 * @param theme - Base theme to apply backgrounds to
 * @param variantConfig - Variant configuration with background overrides
 * @param mode - Current theme mode (dark or light)
 */
export const applyVariantBackgrounds = (
  theme: ChatTheme,
  variantConfig: ThemeVariantConfig,
  mode: 'dark' | 'light',
): void => {
  if (!variantConfig.backgrounds) return

  const bg = variantConfig.backgrounds

  // Apply all standard background properties via mapping
  for (const [themeProp, bgProp] of BACKGROUND_PROPERTY_MAPPING) {
    const bgValue = bg[bgProp]
    if (bgValue !== undefined) {
      const resolved = resolveBackgroundColor(bgValue, mode)
      if (resolved !== undefined) {
        ;(theme as any)[themeProp] = resolved
      }
    }
  }

  // Handle markdown code background (nested property requires special handling)
  if (bg.markdownCode !== undefined && theme.markdown) {
    const resolved = resolveBackgroundColor(bg.markdownCode, mode)
    if (resolved !== undefined) {
      theme.markdown.codeBackground = resolved
    }
  }
}

/**
 * Build a complete theme by layering overrides
 * Applies variant backgrounds, config overrides, custom colors, and plugins
 * @param baseTheme - The base theme to start from
 * @param variant - Theme variant to apply
 * @param variantConfig - Configuration for the variant
 * @param mode - Current theme mode (dark or light)
 * @param customColors - Optional custom color overrides
 * @param plugins - Optional theme plugins to apply
 * @returns Complete theme with all layers applied
 */
export const buildThemeWithVariant = (
  baseTheme: ChatTheme,
  variant: ThemeVariant,
  variantConfig: ThemeVariantConfig,
  mode: 'dark' | 'light',
  customColors?: Partial<ChatTheme>,
  plugins?: ThemePlugin[],
): ChatTheme => {
  // Start with cloned base theme (cloning handled by caller to avoid circular dependency)
  const theme = { ...baseTheme }

  // Layer 1: Apply variant background overrides
  applyVariantBackgrounds(theme, variantConfig, mode)

  // Layer 2: Apply variant-specific overrides
  if (variantConfig.overrides) {
    Object.assign(theme, variantConfig.overrides)
  }

  // Layer 3: Apply global custom colors
  if (customColors) {
    Object.assign(theme, customColors)
  }

  // Layer 4: Apply plugins
  if (plugins) {
    for (const plugin of plugins) {
      const pluginOverrides = plugin.apply(theme, variant, mode)
      Object.assign(theme, pluginOverrides)
    }
  }

  return theme
}
