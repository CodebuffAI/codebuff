import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-bloom',
  title: 'The free alternative to Bloom',
  subtitle: 'Agentic web app creation without the SaaS tier.',
  description:
    'Freebuff Web is the free alternative to Bloom. Same agentic flow — describe the app, get a deployed full-stack app — without monthly fees.',
  category: 'Comparisons',
  publishedAt: '2026-05-23',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'free bloom',
    'bloom alternative',
    'bloom free',
    'bloom vs freebuff',
    'free ai app generator',
    'free agentic web app builder',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Bloom is one of the cleaner agentic web app generators on the market.',
        'Freebuff Web does the same flow at $0/month, no credit ceiling.',
        'Includes free auth, DB, file storage, deploy URLs, and GitHub export.',
      ],
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Bloom' },
    {
      type: 'compare',
      competitor: 'Bloom',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'Paid tiers' },
        { feature: 'Auth + DB', freebuff: 'Free, included', competitor: 'Paid plans' },
        { feature: 'Deployed URL', freebuff: 'Free, per change', competitor: 'Free preview' },
        { feature: 'GitHub eject', freebuff: 'One click', competitor: 'Limited' },
        { feature: 'CLI for power users', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
      ],
    },
    {
      type: 'cta',
      title: 'Skip the paid tier',
      description: 'Same agentic app builder, no monthly fee.',
      href: '/',
      label: 'Open Freebuff Web',
    },
  ],
}
