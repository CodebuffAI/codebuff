# Blog authoring guide

This folder is the **only** place you need to touch to edit the Freebuff blog.

## I want to...

| Task | File to edit |
| --- | --- |
| Change the blog headline ("Free coding agents, *unfiltered*") or tagline | [`config.ts`](./config.ts) — `blogConfig.indexHeadline`, `blogConfig.indexSubhead` |
| Change the blog brand, OG image, publisher logo, Twitter handle, locale | [`config.ts`](./config.ts) — `blogConfig.*` |
| Add a new author (name, role, avatar, twitter, bio) | [`authors.ts`](./authors.ts) — add a key to `authors` |
| Edit an author's name / role / avatar everywhere it appears | [`authors.ts`](./authors.ts) — edit the entry once |
| Add or rename a category (the pill bar on `/blog`) | [`config.ts`](./config.ts) — `blogCategories` |
| Edit an existing post (title, body, author, keywords, ...) | [`posts/<slug>.ts`](./posts) |
| Publish a new post | 1. Create `posts/<slug>.ts` (copy from any existing one). 2. Import + append it in [`registry.ts`](./registry.ts). |
| Feature a post on the index ("Editor's Picks") | Set `featured: true` in the post file. |
| Mark a post as updated | Set `updatedAt: '2026-MM-DD'` in the post file. |

## Post anatomy

Every post is a TypeScript file that exports a single `post` object.

```ts
// posts/my-new-post.ts
import type { Post } from '../types'

export const post: Post = {
  slug: 'my-new-post',                    // URL: /blog/my-new-post
  title: 'A great post title',             // <h1> and <title>
  subtitle: 'Optional one-line subtitle.', // shown under the h1
  description: 'Up to ~160 chars; used for meta description, OG, Twitter, RSS.',
  category: 'Guides',                      // must match a value in blogCategories
  publishedAt: '2026-05-30',               // ISO date (YYYY-MM-DD)
  readingMinutes: 6,                       // estimate
  authorId: 'freebuff-team',               // id from authors.ts
  keywords: ['free claude code', 'free cursor'], // SEO/GEO keywords
  featured: false,                         // surface in "Editor's Picks"
  body: [
    { type: 'tldr', items: ['Bullet 1', 'Bullet 2'] },
    { type: 'lede', text: 'Opening sentence.' },
    { type: 'p', text: 'Paragraph with **bold**, *italic*, and `code`.' },
    { type: 'h2', text: 'A section' },
    { type: 'ul', items: ['Item 1', 'Item 2'] },
    { type: 'compare', competitor: 'Cursor', rows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$20/mo' },
    ]},
    { type: 'callout', tone: 'success', title: 'Pro tip', text: 'Inline `code` works here too.' },
    { type: 'cta', title: 'Try it', description: 'Free.', href: '/', label: 'Install Freebuff' },
    { type: 'faq', items: [{ q: 'Is it free?', a: 'Yes.' }] },
  ],
}
```

All available block types are typed in [`types.ts`](./types.ts).

## Inline formatting

The `text` / `items` strings inside blocks support a tiny markdown subset:

- `**bold**` → **bold**
- `*italic*` → *italic*
- `` `code` `` → `code`
- `[label](https://example.com)` → external link (auto `target="_blank"`)
- `[label](/internal/path)` → internal link

## What you get for free

Each post automatically gets:

- SEO `<title>`, meta description, canonical URL, OG, Twitter card.
- `BlogPosting` JSON-LD with author, publisher, keywords, word count, and a `speakable` block (used by AI search to know what to quote aloud).
- `FAQPage` JSON-LD generated from any `faq` block (this is what makes Google show your FAQs in search results).
- `BreadcrumbList` JSON-LD.
- An entry in the sitemap (`/sitemap.xml`) and the RSS feed (`/blog/rss.xml`).
- "Keep reading" related posts based on category + keyword overlap.
- A dedicated card on `/blog`.

No further setup needed.
