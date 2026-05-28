/**
 * Editable in-one-place configuration for the blog.
 *
 * Update site-wide titles, taglines, default authors, and category lists here.
 * Individual post titles + authors live in `lib/blog/authors.ts` and
 * `lib/blog/posts/<slug>.ts`.
 */
export const blogConfig = {
  /** Brand shown in nav + footer + JSON-LD `publisher`. */
  brand: 'Freebuff',
  /** Page heading on /blog. Wrap an emphasized phrase in *...*. */
  indexHeadline: 'Free coding agents, *unfiltered*',
  /** Subtitle on /blog. */
  indexSubhead:
    'Launches, deep dives, and head-to-head guides for the free alternative to every paid coding agent.',
  /** Default tagline used in JSON-LD / OG / Twitter description fallbacks. */
  defaultDescription:
    'The free coding agent. No subscription. No configuration. Start in seconds.',
  /** Default OG image (lives in /public). */
  defaultOgImage: '/favicon.svg',
  /** Path that hosts the blog under the site root. */
  basePath: '/blog',
  /** Default author id if a post forgets to set one. */
  defaultAuthorId: 'freebuff-team',
  /** Display name used in JSON-LD `publisher.name`. */
  publisherName: 'Freebuff',
  /** Publisher logo path (used in JSON-LD). */
  publisherLogo: '/logo-icon.png',
  /** Twitter handle without leading @ for twitter:site. */
  twitterHandle: 'freebuffai',
  /** Locale used in OG metadata. */
  locale: 'en_US',
  /** Posts per page on the blog index. */
  postsPerPage: 24,
  /** Featured posts count on the index hero. */
  featuredCount: 3,
} as const

/**
 * Canonical list of blog categories.
 *
 * Used both for the filter pill bar on `/blog` and to validate post category
 * strings. Keep these short — they render as small caps badges.
 */
export const blogCategories = [
  'All',
  'Launches',
  'Comparisons',
  'Guides',
  'Research',
  'Engineering',
  'Community',
] as const

export type BlogCategory = (typeof blogCategories)[number]
