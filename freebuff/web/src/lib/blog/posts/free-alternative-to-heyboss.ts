import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-heyboss',
  title: 'The free alternative to HeyBoss',
  subtitle: 'AI app builder + free hosting + a CLI escape hatch when you outgrow the prompt box.',
  description:
    'Freebuff Web is the free alternative to HeyBoss. Same prompt-to-app loop, no monthly subscription, with a paired CLI for the moment you need to ship real code.',
  category: 'Comparisons',
  publishedAt: '2026-05-18',
  readingMinutes: 6,
  authorId: 'victor-cheng',
  keywords: [
    'free heyboss',
    'heyboss alternative',
    'heyboss free',
    'heyboss vs freebuff',
    'free ai app builder',
    'free no code ai',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'HeyBoss is a polished AI app builder with monthly plans.',
        'Freebuff Web does the prompt-to-app loop for free, with auth and DB built in.',
        'When the visual builder runs out of road, Freebuff CLI takes over — same repo.',
      ],
    },
    {
      type: 'lede',
      text: 'HeyBoss is great for non-engineers shipping their first app. Freebuff Web is HeyBoss without the subscription, plus a real CLI agent for when your app gets serious.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs HeyBoss' },
    {
      type: 'compare',
      competitor: 'HeyBoss',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'Subscription' },
        { feature: 'Auth + database included', freebuff: 'Yes', competitor: 'Limited on free plan' },
        { feature: 'Deployed URL', freebuff: 'Per change, free', competitor: 'On paid plans' },
        { feature: 'GitHub eject', freebuff: 'One click', competitor: 'Paid feature' },
        { feature: 'Paired CLI agent', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
        { feature: 'Visual element editor', freebuff: 'Yes', competitor: 'Yes' },
      ],
    },
    { type: 'h2', text: 'Who should switch' },
    {
      type: 'ul',
      items: [
        '**Hitting the HeyBoss free-plan ceiling** — Freebuff Web has no per-month cap.',
        '**Want to own your code** — every Freebuff project ejects to GitHub for free.',
        '**Going from prototype to real product** — drop into Freebuff CLI when prompts aren\u2019t enough.',
      ],
    },
    {
      type: 'cta',
      title: 'Build full-stack apps for free',
      description: 'Same prompt-to-app loop, no subscription, real code you own.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Can I migrate a HeyBoss project?',
          a: 'Yes if you can export the code. Push to GitHub, then import into Freebuff Web and continue iterating with prompts or the CLI.',
        },
      ],
    },
  ],
}
