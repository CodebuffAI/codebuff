import { post as bestFreeCliCodingAgents2026 } from './posts/best-free-cli-coding-agents-2026'
import { post as byokChatgptWithFreebuff } from './posts/byok-chatgpt-with-freebuff'
import { post as codingAgentBenchmarksWhatTheyMiss } from './posts/coding-agent-benchmarks-what-they-miss'
import { post as freeAlternativeToA0Dev } from './posts/free-alternative-to-a0-dev'
import { post as freeAlternativeToAntigravity } from './posts/free-alternative-to-antigravity'
import { post as freeAlternativeToBase44 } from './posts/free-alternative-to-base44'
import { post as freeAlternativeToBloom } from './posts/free-alternative-to-bloom'
import { post as freeAlternativeToBolt } from './posts/free-alternative-to-bolt'
import { post as freeAlternativeToClaudeCode } from './posts/free-alternative-to-claude-code'
import { post as freeAlternativeToCodex } from './posts/free-alternative-to-codex'
import { post as freeAlternativeToCursor } from './posts/free-alternative-to-cursor'
import { post as freeAlternativeToDevin } from './posts/free-alternative-to-devin'
import { post as freeAlternativeToEmergent } from './posts/free-alternative-to-emergent'
import { post as freeAlternativeToFloot } from './posts/free-alternative-to-floot'
import { post as freeAlternativeToGeminiCli } from './posts/free-alternative-to-gemini-cli'
import { post as freeAlternativeToHeyboss } from './posts/free-alternative-to-heyboss'
import { post as freeAlternativeToLovable } from './posts/free-alternative-to-lovable'
import { post as freeAlternativeToOpencode } from './posts/free-alternative-to-opencode'
import { post as freeAlternativeToReplit } from './posts/free-alternative-to-replit'
import { post as freeAlternativeToVibecode } from './posts/free-alternative-to-vibecode'
import { post as freeAlternativeToWindsurf } from './posts/free-alternative-to-windsurf'
import { post as freebuffInTheWildMay } from './posts/freebuff-in-the-wild-may'
import { post as freebuffLaunch } from './posts/freebuff-launch'
import { post as freebuffSubagentsDeepDive } from './posts/freebuff-subagents-deep-dive'
import { post as freebuffWebLaunch } from './posts/freebuff-web-launch'
import { post as freebuffWebVsLovableBoltReplit } from './posts/freebuff-web-vs-lovable-bolt-replit'
import { post as sideIncomeWithFreebuffIndia } from './posts/side-income-with-freebuff-india'
import { post as stateOfFreeAiCoding2026 } from './posts/state-of-free-ai-coding-2026'
import { post as switchFromCursorToFreebuff } from './posts/switch-from-cursor-to-freebuff'
import { post as vlyBecomesFreebuffWeb } from './posts/vly-becomes-freebuff-web'
import { post as whatDevelopersAreSaying } from './posts/what-developers-are-saying'
import { post as whyFreeCodingAgentsWon2026 } from './posts/why-free-coding-agents-won-2026'

import type { Post } from './types'

/**
 * Canonical list of all published blog posts.
 *
 * Add a new post by creating it in `posts/<slug>.ts` and appending it here.
 * The blog index, sitemap, RSS feed, and `/blog/[slug]` route all read from
 * this list.
 */
const allPosts: Post[] = [
  // Launches
  freebuffLaunch,
  freebuffWebLaunch,
  vlyBecomesFreebuffWeb,

  // Comparisons — CLI agents
  freeAlternativeToClaudeCode,
  freeAlternativeToCodex,
  freeAlternativeToCursor,
  freeAlternativeToWindsurf,
  freeAlternativeToDevin,
  freeAlternativeToOpencode,
  freeAlternativeToGeminiCli,
  freeAlternativeToAntigravity,

  // Comparisons — App builders
  freeAlternativeToLovable,
  freeAlternativeToReplit,
  freeAlternativeToBolt,
  freeAlternativeToEmergent,
  freeAlternativeToVibecode,
  freeAlternativeToHeyboss,
  freeAlternativeToFloot,
  freeAlternativeToBase44,
  freeAlternativeToA0Dev,
  freeAlternativeToBloom,
  freebuffWebVsLovableBoltReplit,

  // Guides
  bestFreeCliCodingAgents2026,
  switchFromCursorToFreebuff,
  byokChatgptWithFreebuff,

  // Research
  stateOfFreeAiCoding2026,
  whyFreeCodingAgentsWon2026,
  codingAgentBenchmarksWhatTheyMiss,

  // Engineering
  freebuffSubagentsDeepDive,

  // Community / Voices
  whatDevelopersAreSaying,
  sideIncomeWithFreebuffIndia,
  freebuffInTheWildMay,
]

/**
 * Sorted newest-first. Used by the index, RSS, and sitemap.
 */
export function getAllPosts(): Post[] {
  return [...allPosts].sort((a, b) =>
    b.publishedAt.localeCompare(a.publishedAt),
  )
}

export function getPostBySlug(slug: string): Post | undefined {
  return allPosts.find((p) => p.slug === slug)
}

export function getFeaturedPosts(limit = 3): Post[] {
  const featured = getAllPosts().filter((p) => p.featured)
  if (featured.length >= limit) return featured.slice(0, limit)
  // Pad with the most recent posts if we don't have enough featured ones.
  const seen = new Set(featured.map((p) => p.slug))
  for (const p of getAllPosts()) {
    if (featured.length >= limit) break
    if (!seen.has(p.slug)) featured.push(p)
  }
  return featured.slice(0, limit)
}

export function getRelatedPosts(slug: string, limit = 3): Post[] {
  const current = getPostBySlug(slug)
  if (!current) return []
  return getAllPosts()
    .filter((p) => p.slug !== slug)
    .map((p) => ({
      post: p,
      score:
        (p.category === current.category ? 2 : 0) +
        p.keywords.filter((k) => current.keywords.includes(k)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.post)
}

export function getAllCategoriesInUse(): string[] {
  const set = new Set<string>()
  for (const p of allPosts) set.add(p.category)
  return Array.from(set)
}
