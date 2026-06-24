import type { Post } from '../types'

export const post: Post = {
  slug: 'free-macaly-ai-app-builder-alternative-freebuff',
  title: 'The free alternative to Macaly',
  subtitle: 'Same prompt-to-deployed-app loop — without the $25/mo (Pro) bill.',
  description:
    'Freebuff Web is the free alternative to Macaly. Build full-stack apps with auth, database, and hosting included — 100% free, no credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  keywords: [
    'free macaly alternative',
    'macaly ai app builder',
    'macaly.com ai website builder',
    'macaly app builder free',
    'macaly free',
    'macaly vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web is a free alternative to Macaly — prompt to deployed full-stack app.',
        'Macaly typical paid tier: $25/mo (Pro). Freebuff Web is $0.',
        'Auth, database, file storage, hosting, and a paired CLI are included.',
        'You own the code — eject to GitHub any time.',

      ],
    },
    {
      type: 'lede',
      text: 'Macaly builds websites, dashboards, and web apps from natural-language prompts with hosting and database included. Freebuff Web does the same job without a subscription or credit meter.',
    },
    { type: 'h2', text: 'What Macaly costs in 2026' },
    {
      type: 'p',
      text: 'Macaly Pro is $25/mo with custom domains, code access, and monthly AI credits. Enterprise is custom. A $5/mo Hosting-only plan keeps domains live without AI credits (per [macaly.com/pricing](https://www.macaly.com/pricing)). Most builders who iterate daily land on a paid tier quickly once the free allowance runs out.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Macaly' },
    {
      type: 'compare',
      competitor: 'Macaly',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$25/mo (Pro)' },
        { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — monthly credits' },
        { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Pro plan' },
        { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Included' },
        { feature: 'Code access', freebuff: 'Full repo', competitor: 'Pro plan' },
        { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'When Macaly is still the better pick' },
    {
      type: 'p',
      text: 'Macaly is approachable for founders and small businesses who want a guided builder with SEO tooling built in.',
    },
    { type: 'h2', text: 'How to move from Macaly to Freebuff' },
    {
      type: 'ol',
      items: [
        'Export code from Macaly Pro and import the repo into Freebuff Web.',
        'In Freebuff Web, click Import from GitHub and paste the repo URL (or start a fresh project with the same prompt).',
        'Freebuff wires up auth, database, and a deployed URL automatically.',
        'Keep iterating in the browser, or eject and run `freebuff` in your terminal for heavy refactors.',
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'No lock-in',
      text: 'Freebuff projects are vanilla TypeScript repos. Host on Vercel, Cloudflare, or anywhere. We give you a free URL by default.',
    },
    {
      type: 'cta',
      title: 'Try the free alternative to Macaly',
      description: 'Ship a deployed full-stack app in minutes — $0/month.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is Freebuff Web really free?',
          a: 'Yes. No per-prompt credits, no daily generation cap for normal use. Auth, database, and hosting are included.',
        },
        {
          q: 'Can Freebuff do everything Macaly does?',
          a: 'For the core loop — prompt, iterate, deploy a real app with auth and database — yes. Niche integrations may differ; you can always import code and extend in the Freebuff CLI.',
        },
        {
          q: 'How much does Macaly cost per year on a typical paid plan?',
          a: 'At $25/mo (Pro), expect roughly $300/year before overages. Freebuff is $0.',
        },
        {
          q: 'Can I import my existing Macaly project?',
          a: 'Yes — export to GitHub from Macaly (where supported) and import into Freebuff Web. We auto-detect the stack.',
        },
      ],
    },
  ],
}
