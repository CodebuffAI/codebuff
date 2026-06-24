/**
 * Canonical SEO slugs for competitor comparison + savings blog posts.
 * Slugs embed top search queries for ranking; legacy slugs redirect in next.config.
 */

export type BlogProduct = 'web' | 'cli'

export interface BlogSeoEntry {
  id: string
  product: BlogProduct
  /** New comparison post slug (also the filename without .ts). */
  comparisonSlug: string
  /** Previous slug, if any — emits a 308 redirect from /blog/{legacy}. */
  legacyComparisonSlug?: string
  /** Savings story slug; omit if no savings post. */
  savingsSlug?: string
  legacySavingsSlug?: string
  /** Annual savings figure used in savings slug + copy. */
  savingsAnnual?: number
}

export const blogSeoEntries: BlogSeoEntry[] = [
  // —— App builders (DesignArena) ——
  {
    id: 'anything',
    product: 'web',
    comparisonSlug: 'free-anything-com-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-anything',
    savingsSlug: 'save-288-per-year-anything-com-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-anything-user-saved-288-switching-to-freebuff',
    savingsAnnual: 288,
  },
  {
    id: 'aura',
    product: 'web',
    comparisonSlug: 'free-aura-build-ai-website-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-aura',
    savingsSlug: 'save-600-per-year-aura-build-ai-website-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-aura-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'base44',
    product: 'web',
    comparisonSlug: 'free-base44-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-base44',
    savingsSlug: 'save-960-per-year-base44-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-base44-user-saved-960-switching-to-freebuff',
    savingsAnnual: 960,
  },
  {
    id: 'bolt',
    product: 'web',
    comparisonSlug: 'free-bolt-new-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-bolt',
    savingsSlug: 'save-600-per-year-bolt-new-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-bolt-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'canva',
    product: 'web',
    comparisonSlug: 'free-canva-code-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-canva',
    savingsSlug: 'save-252-per-year-canva-code-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-canva-user-saved-252-switching-to-freebuff',
    savingsAnnual: 252,
  },
  {
    id: 'cosmic',
    product: 'web',
    comparisonSlug: 'free-cosmic-new-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-cosmic',
    savingsSlug: 'save-360-per-year-cosmic-new-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-cosmic-user-saved-360-switching-to-freebuff',
    savingsAnnual: 360,
  },
  {
    id: 'emergent',
    product: 'web',
    comparisonSlug: 'free-emergent-sh-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-emergent',
    savingsSlug: 'save-600-per-year-emergent-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-emergent-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'figma-make',
    product: 'web',
    comparisonSlug: 'free-figma-make-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-figma-make',
    savingsSlug: 'save-240-per-year-figma-make-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-figma-make-user-saved-240-switching-to-freebuff',
    savingsAnnual: 240,
  },
  {
    id: 'floot',
    product: 'web',
    comparisonSlug: 'free-floot-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-floot',
    savingsSlug: 'save-300-per-year-floot-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-floot-user-saved-300-switching-to-freebuff',
    savingsAnnual: 300,
  },
  {
    id: 'google-ai-studio',
    product: 'web',
    comparisonSlug: 'free-google-ai-studio-gemini-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-google-ai-studio',
    savingsSlug: 'save-240-per-year-google-ai-studio-gemini-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-google-ai-studio-user-saved-240-switching-to-freebuff',
    savingsAnnual: 240,
  },
  {
    id: 'lovable',
    product: 'web',
    comparisonSlug: 'free-lovable-dev-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-lovable',
    savingsSlug: 'save-600-per-year-lovable-dev-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-lovable-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'macaly',
    product: 'web',
    comparisonSlug: 'free-macaly-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-macaly',
    savingsSlug: 'save-300-per-year-macaly-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-macaly-user-saved-300-switching-to-freebuff',
    savingsAnnual: 300,
  },
  {
    id: 'magic-patterns',
    product: 'web',
    comparisonSlug: 'free-magic-patterns-ai-ui-generator-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-magic-patterns',
    savingsSlug: 'save-1200-per-year-magic-patterns-ai-ui-generator-freebuff-alternative',
    legacySavingsSlug: 'how-one-magic-patterns-user-saved-1200-switching-to-freebuff',
    savingsAnnual: 1200,
  },
  {
    id: 'mocha',
    product: 'web',
    comparisonSlug: 'free-getmocha-mocha-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-mocha',
    savingsSlug: 'save-600-per-year-getmocha-mocha-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-mocha-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'orchids',
    product: 'web',
    comparisonSlug: 'free-orchids-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-orchids',
    savingsSlug: 'save-600-per-year-orchids-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-orchids-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'replit',
    product: 'web',
    comparisonSlug: 'free-replit-agent-design-mode-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-replit',
    savingsSlug: 'save-300-per-year-replit-agent-design-mode-freebuff-alternative',
    legacySavingsSlug: 'how-one-replit-user-saved-300-switching-to-freebuff',
    savingsAnnual: 300,
  },
  {
    id: 'same-new',
    product: 'web',
    comparisonSlug: 'free-same-new-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-same-new',
    savingsSlug: 'save-600-per-year-same-new-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-same-new-user-saved-600-switching-to-freebuff',
    savingsAnnual: 600,
  },
  {
    id: 'v0',
    product: 'web',
    comparisonSlug: 'free-v0-vercel-ai-app-builder-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-v0',
    savingsSlug: 'save-360-per-year-v0-vercel-ai-app-builder-freebuff-alternative',
    legacySavingsSlug: 'how-one-v0-user-saved-360-switching-to-freebuff',
    savingsAnnual: 360,
  },

  // —— CLI agents (DesignArena / terminal bench) ——
  {
    id: 'claude-code',
    product: 'cli',
    comparisonSlug: 'free-claude-code-cli-coding-agent-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-claude-code',
    savingsSlug: 'save-240-per-year-claude-code-cli-freebuff-alternative',
    legacySavingsSlug: 'how-one-claude-code-user-saved-240-switching-to-freebuff-cli',
    savingsAnnual: 240,
  },
  {
    id: 'codex',
    product: 'cli',
    comparisonSlug: 'free-codex-cli-openai-coding-agent-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-codex',
    savingsSlug: 'save-240-per-year-codex-cli-chatgpt-plus-freebuff-alternative',
    legacySavingsSlug: 'how-one-codex-cli-user-saved-240-switching-to-freebuff',
    savingsAnnual: 240,
  },
  {
    id: 'opencode',
    product: 'cli',
    comparisonSlug: 'free-opencode-cli-coding-agent-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-opencode',
    savingsSlug: 'save-360-per-year-opencode-cli-api-costs-freebuff-alternative',
    legacySavingsSlug: 'how-one-opencode-user-saved-360-switching-to-freebuff-cli',
    savingsAnnual: 360,
  },
  {
    id: 'cursor',
    product: 'cli',
    comparisonSlug: 'free-cursor-agent-cli-coding-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-cursor',
    savingsSlug: 'save-240-per-year-cursor-agent-pro-freebuff-cli-alternative',
    legacySavingsSlug: 'how-one-cursor-agent-user-saved-240-switching-to-freebuff-cli',
    savingsAnnual: 240,
  },
  {
    id: 'antigravity',
    product: 'cli',
    comparisonSlug: 'free-antigravity-cli-coding-agent-alternative-freebuff',
    legacyComparisonSlug: 'free-alternative-to-antigravity',
    savingsSlug: 'save-240-per-year-antigravity-cli-gemini-freebuff-alternative',
    legacySavingsSlug: 'how-one-antigravity-cli-user-saved-240-switching-to-freebuff',
    savingsAnnual: 240,
  },
  {
    id: 'pi',
    product: 'cli',
    comparisonSlug: 'free-pi-coding-agent-cli-alternative-freebuff',
    savingsSlug: 'save-240-per-year-pi-coding-agent-api-freebuff-cli-alternative',
    savingsAnnual: 240,
  },
  {
    id: 'github-copilot-cli',
    product: 'cli',
    comparisonSlug: 'free-github-copilot-cli-coding-agent-alternative-freebuff',
    savingsSlug: 'save-468-per-year-github-copilot-cli-pro-plus-freebuff-alternative',
    savingsAnnual: 468,
  },
]

/** All blog post slug redirects: legacy → canonical. */
export function getBlogSlugRedirects(): Array<{ source: string; destination: string }> {
  const out: Array<{ source: string; destination: string }> = []
  for (const e of blogSeoEntries) {
    if (e.legacyComparisonSlug && e.legacyComparisonSlug !== e.comparisonSlug) {
      out.push({
        source: `/blog/${e.legacyComparisonSlug}`,
        destination: `/blog/${e.comparisonSlug}`,
      })
    }
    if (
      e.legacySavingsSlug &&
      e.savingsSlug &&
      e.legacySavingsSlug !== e.savingsSlug
    ) {
      out.push({
        source: `/blog/${e.legacySavingsSlug}`,
        destination: `/blog/${e.savingsSlug}`,
      })
    }
  }
  return out
}

export function getBlogSeoEntry(id: string): BlogSeoEntry | undefined {
  return blogSeoEntries.find((e) => e.id === id)
}
