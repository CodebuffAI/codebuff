/**
 * Blog post block schema.
 *
 * Posts are written as a list of structured blocks instead of raw JSX or MDX.
 * Authors get consistent formatting for free, and we can render the same
 * content to HTML, structured data (JSON-LD), and plain text (for AI summaries
 * and RSS) without parsing markdown.
 */
export type Block =
  | { type: 'p'; text: string }
  | { type: 'lede'; text: string }
  | { type: 'h2'; text: string; id?: string }
  | { type: 'h3'; text: string; id?: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string; attribution?: string }
  | { type: 'callout'; tone?: 'info' | 'success' | 'warning'; title?: string; text: string }
  | { type: 'code'; lang?: string; code: string; caption?: string }
  | { type: 'cta'; title: string; description?: string; href: string; label: string }
  | {
      type: 'compare'
      competitor: string
      rows: Array<{ feature: string; freebuff: string; competitor: string }>
    }
  | { type: 'faq'; items: Array<{ q: string; a: string }> }
  | { type: 'tldr'; items: string[] }
  | { type: 'hr' }

export interface Author {
  id: string
  name: string
  role?: string
  avatar?: string
  twitter?: string
  bio?: string
}

export interface PostMeta {
  /** URL slug (e.g. "free-alternative-to-lovable"). Must be unique. */
  slug: string
  /** Page <h1> and OpenGraph title. */
  title: string
  /** ≤160 chars. Used for meta description and OG description. */
  description: string
  /** Category label used for filtering + display badge. */
  category: string
  /** ISO date string (YYYY-MM-DD). */
  publishedAt: string
  /** Optional ISO date for "Last updated". */
  updatedAt?: string
  /** Estimated read time in minutes. */
  readingMinutes: number
  /** Author id from `authors.ts`. */
  authorId: string
  /** Optional co-author ids. */
  coAuthorIds?: string[]
  /** Article keywords (helps search + AI summarization). */
  keywords: string[]
  /** OG image path (public/...). Defaults to site-wide OG. */
  ogImage?: string
  /** If true, surfaced in "Editor's Picks". */
  featured?: boolean
  /** Optional short subtitle shown under the title. */
  subtitle?: string
  /** Optional canonical override (full URL). */
  canonical?: string
}

export interface Post extends PostMeta {
  body: Block[]
}
