import type { Post } from '../types'

export const post: Post = {
  slug: 'free-orchids-ai-app-builder-alternative-freebuff',
  title: 'The free alternative to Orchids',
  subtitle: 'Same prompt-to-deployed-app loop — without the $50/mo (Premium, monthly billing) bill.',
  description:
    'Freebuff Web is the free alternative to Orchids. Build full-stack apps with auth, database, and hosting included — 100% free, no credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  keywords: [
    'free orchids ai app builder',
    'orchids ai app builder',
    'orchids.app free',
    'orchids ai free',
    'orchids v2 ai',
    'orchids ai website builder',
    'orchids no code app builder',
    'orchids ai code generator',
    'orchids vs lovable',
    'orchids vs bolt',
    'orchids vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web is a free alternative to Orchids — prompt to deployed full-stack app.',
        'Orchids typical paid tier: $50/mo (Premium, monthly billing). Freebuff Web is $0.',
        'Auth, database, file storage, hosting, and a paired CLI are included.',
        'You own the code — eject to GitHub any time.',

      ],
    },
    {
      type: 'lede',
      text: 'Orchids (YC W25) is a design-first AI website and app builder with strong visual defaults and analytics. Freebuff Web does the same job without a subscription or credit meter.',
    },
    { type: 'h2', text: 'What Orchids costs in 2026' },
    {
      type: 'p',
      text: 'Orchids Premium is $42/mo billed annually or $50/mo billed monthly with 4M monthly credits and unlimited projects. Ultra is $99/mo; Max is $200/mo (per [Orchids plans docs](https://docs.orchids.app/plans-and-token-usage)). Most builders who iterate daily land on a paid tier quickly once the free allowance runs out.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Orchids' },
    {
      type: 'compare',
      competitor: 'Orchids',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$50/mo Premium' },
        { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — monthly credits' },
        { feature: 'Free tier', freebuff: 'Full product', competitor: '100k credits, 3 projects' },
        { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Wired in' },
        { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Paid plans' },
        { feature: 'Eject to GitHub', freebuff: 'One click', competitor: 'Yes' },
        { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'When Orchids is still the better pick' },
    {
      type: 'p',
      text: 'Orchids excels at polished marketing sites and portfolios where design quality is the primary constraint.',
    },
    { type: 'h2', text: 'How to move from Orchids to Freebuff' },
    {
      type: 'ol',
      items: [
        'Export to GitHub from Orchids and import into Freebuff Web.',
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
      title: 'Try the free alternative to Orchids',
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
          q: 'Can Freebuff do everything Orchids does?',
          a: 'For the core loop — prompt, iterate, deploy a real app with auth and database — yes. Niche integrations may differ; you can always import code and extend in the Freebuff CLI.',
        },
        {
          q: 'How much does Orchids cost per year on a typical paid plan?',
          a: 'At $50/mo (Premium, monthly billing), expect roughly $600/year before overages. Freebuff is $0.',
        },
        {
          q: 'Can I import my existing Orchids project?',
          a: 'Yes — export to GitHub from Orchids (where supported) and import into Freebuff Web. We auto-detect the stack.',
        },
      ],
    },
  ],
}
