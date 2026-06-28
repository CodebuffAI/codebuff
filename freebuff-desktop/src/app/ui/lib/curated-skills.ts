import type { SkillSearchResult } from './types'

/**
 * Hand-picked skills shown when you open "add skills" with an empty query, so
 * there's something useful to browse before typing. The registry has no
 * "popular/browse" endpoint, and its fuzzy search makes a poor stand-in (it
 * front-loads whatever literally matches the seed word), so we curate instead.
 *
 * Chosen for variety across what people actually reach for — discovery, design,
 * code quality, git/CI/deploy, languages, data/auth/payments, diagrams — and
 * skewed toward reputable, well-installed sources (Anthropic, Vercel, Supabase,
 * Stripe, obra/superpowers, …). Browsing is instant because this is a static
 * constant, not a network call.
 *
 * Install counts are a point-in-time snapshot (captured 2026-06-27) shown only
 * as a rough popularity signal. To refresh/extend, query the registry's
 * `https://skills.sh/api/search?q=<term>` and read id/skillId/source/installs.
 */
export const CURATED_POPULAR: SkillSearchResult[] = [
  // — Discover & author —
  { id: 'vercel-labs/skills/find-skills', name: 'find-skills', slug: 'find-skills', source: 'vercel-labs/skills', installs: 2228987 },
  { id: 'anthropics/skills/skill-creator', name: 'skill-creator', slug: 'skill-creator', source: 'anthropics/skills', installs: 289996 },
  // — Frontend & design —
  { id: 'anthropics/skills/frontend-design', name: 'frontend-design', slug: 'frontend-design', source: 'anthropics/skills', installs: 598092 },
  { id: 'vercel-labs/agent-skills/web-design-guidelines', name: 'web-design-guidelines', slug: 'web-design-guidelines', source: 'vercel-labs/agent-skills', installs: 420251 },
  { id: 'vercel-labs/agent-skills/vercel-react-best-practices', name: 'vercel-react-best-practices', slug: 'vercel-react-best-practices', source: 'vercel-labs/agent-skills', installs: 507380 },
  { id: 'google-labs-code/stitch-skills/shadcn-ui', name: 'shadcn-ui', slug: 'shadcn-ui', source: 'google-labs-code/stitch-skills', installs: 42149 },
  // — Code quality & workflow —
  { id: 'obra/superpowers/systematic-debugging', name: 'systematic-debugging', slug: 'systematic-debugging', source: 'obra/superpowers', installs: 162247 },
  { id: 'obra/superpowers/test-driven-development', name: 'test-driven-development', slug: 'test-driven-development', source: 'obra/superpowers', installs: 143639 },
  { id: 'obra/superpowers/requesting-code-review', name: 'requesting-code-review', slug: 'requesting-code-review', source: 'obra/superpowers', installs: 145093 },
  { id: 'mattpocock/skills/improve-codebase-architecture', name: 'improve-codebase-architecture', slug: 'improve-codebase-architecture', source: 'mattpocock/skills', installs: 332451 },
  { id: 'mattpocock/skills/setup-pre-commit', name: 'setup-pre-commit', slug: 'setup-pre-commit', source: 'mattpocock/skills', installs: 73213 },
  // — Git, CI & deploy —
  { id: 'github/awesome-copilot/git-commit', name: 'git-commit', slug: 'git-commit', source: 'github/awesome-copilot', installs: 36979 },
  { id: 'xixu-me/skills/github-actions-docs', name: 'github-actions-docs', slug: 'github-actions-docs', source: 'xixu-me/skills', installs: 249325 },
  { id: 'vercel-labs/agent-skills/deploy-to-vercel', name: 'deploy-to-vercel', slug: 'deploy-to-vercel', source: 'vercel-labs/agent-skills', installs: 80205 },
  // — Languages & backend —
  { id: 'wshobson/agents/typescript-advanced-types', name: 'typescript-advanced-types', slug: 'typescript-advanced-types', source: 'wshobson/agents', installs: 49951 },
  { id: 'wshobson/agents/nodejs-backend-patterns', name: 'nodejs-backend-patterns', slug: 'nodejs-backend-patterns', source: 'wshobson/agents', installs: 38017 },
  // — Data, auth & payments —
  { id: 'supabase/agent-skills/supabase-postgres-best-practices', name: 'supabase-postgres-best-practices', slug: 'supabase-postgres-best-practices', source: 'supabase/agent-skills', installs: 254865 },
  { id: 'better-auth/skills/better-auth-best-practices', name: 'better-auth-best-practices', slug: 'better-auth-best-practices', source: 'better-auth/skills', installs: 65927 },
  { id: 'stripe/ai/stripe-best-practices', name: 'stripe-best-practices', slug: 'stripe-best-practices', source: 'stripe/ai', installs: 49869 },
  // — Diagrams —
  { id: 'github/awesome-copilot/excalidraw-diagram-generator', name: 'excalidraw-diagram-generator', slug: 'excalidraw-diagram-generator', source: 'github/awesome-copilot', installs: 25210 },
]
