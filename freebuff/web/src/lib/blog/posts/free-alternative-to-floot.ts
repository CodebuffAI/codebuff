import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-floot',
  title: 'The free alternative to Floot',
  subtitle: 'Same agentic web app builder — open source repo, no monthly plan.',
  description:
    'Freebuff Web is the free alternative to Floot. Build agentic web apps from a prompt, get a real GitHub repo, and skip the paid tier. Free auth, free DB, free deploys.',
  category: 'Comparisons',
  publishedAt: '2026-05-19',
  updatedAt: '2026-06-08',
  readingMinutes: 5,
  authorId: 'victor-cheng',
  keywords: [
    'free floot alternative',
    'floot ai app builder',
    'floot.com alternative',
    'floot free',
    'floot vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Floot ships a clean prompt-to-app experience for web apps.',
        'Freebuff Web matches it for $0 — auth, DB, file storage, deploy URL all included.',
        'Eject to GitHub at any moment; keep building with the Freebuff CLI.',
      ],
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Floot' },
    {
      type: 'compare',
      competitor: 'Floot',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'Free preview; ~$25/mo paid (est.)' },
        { feature: 'Auth + DB', freebuff: 'Included', competitor: 'Limited on free' },
        { feature: 'Deployed URL', freebuff: 'Free, per change', competitor: 'Free during preview' },
        { feature: 'GitHub eject', freebuff: 'One click', competitor: 'Limited' },
        { feature: 'Paired CLI agent', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'What Floot costs' },
    {
      type: 'p',
      text: 'Floot launched with a free preview period. Paid tiers are rolling out — budget **$20–$50/mo** for a typical AI app-builder subscription once you need production domains, higher limits, and sustained iteration beyond preview.',
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'Free preview vs free product',
      text: 'Most AI app builders are "free during preview." Freebuff Web is free as a long-term commitment — supported by CLI ads on the Freebuff CLI side, not by surprise pricing changes.',
    },
    {
      type: 'cta',
      title: 'Build web apps without a paywall',
      description: 'Get the same agentic loop, no credit ceiling.',
      href: '/',
      label: 'Open Freebuff Web',
    },
  ],
}
