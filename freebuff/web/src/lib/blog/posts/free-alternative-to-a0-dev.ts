import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-a0-dev',
  title: 'The free alternative to a0.dev',
  subtitle: 'Mobile + web AI app generator without the credit meter.',
  description:
    'Freebuff Web is the free alternative to a0.dev. Same prompt-to-app loop with auth, database, and deploy URLs included. No credit ceiling, free forever.',
  category: 'Comparisons',
  publishedAt: '2026-05-22',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'free a0.dev',
    'a0.dev alternative',
    'a0.dev free',
    'a0 dev vs freebuff',
    'free ai mobile app builder',
    'free ai app generator',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'a0.dev is great at fast mobile + web app generation.',
        'Freebuff Web matches on the web side for free, with auth/DB/deploy built in.',
        'For native mobile, Freebuff CLI + Expo gets you there in a few prompts.',
      ],
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs a0.dev' },
    {
      type: 'compare',
      competitor: 'a0.dev',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'Free tier capped' },
        { feature: 'Credit meter', freebuff: 'None', competitor: 'Per-prompt credits' },
        { feature: 'Web app generation', freebuff: 'Yes', competitor: 'Yes' },
        { feature: 'Mobile app generation', freebuff: 'Via Freebuff CLI + Expo', competitor: 'Native (preview)' },
        { feature: 'Auth + DB included', freebuff: 'Yes', competitor: 'Limited on free' },
        { feature: 'GitHub eject', freebuff: 'One click', competitor: 'Limited' },
      ],
    },
    {
      type: 'cta',
      title: 'Build apps free, no credits',
      description: 'Same prompt-to-app loop, no per-generation meter.',
      href: '/',
      label: 'Open Freebuff Web',
    },
  ],
}
