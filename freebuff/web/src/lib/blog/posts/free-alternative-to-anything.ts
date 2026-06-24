import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-anything',
  title: 'The free alternative to Anything',
  subtitle: 'Same prompt-to-deployed-app loop — without the $24/mo (Pro, monthly billing) bill.',
  description:
    'Freebuff Web is the free alternative to Anything. Build full-stack apps with auth, database, and hosting included — 100% free, no credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  keywords: [
    'free anything alternative',
    'anything.com ai app builder',
    'createanything.com free',
    'anything ai app builder',
    'create anything ai builder',
    'anything.com alternative free',
    'anything vs lovable',
    'anything app builder pricing',
    'anything vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web is a free alternative to Anything — prompt to deployed full-stack app.',
        'Anything typical paid tier: $24/mo (Pro, monthly billing). Freebuff Web is $0.',
        'Auth, database, file storage, hosting, and a paired CLI are included.',
        'You own the code — eject to GitHub any time.',

      ],
    },
    {
      type: 'lede',
      text: 'Anything (createanything.com) builds web and mobile apps from prompts, with Stripe/RevenueCat payments, custom domains, and App Store publishing on paid tiers. Freebuff Web does the same job without a subscription or credit meter.',
    },
    { type: 'h2', text: 'What Anything costs in 2026' },
    {
      type: 'p',
      text: 'Anything Pro is $19/mo billed annually or $24/mo billed monthly for 20,000 monthly credits. The Max tier jumps to $199–$239/mo for parallel agents and higher credit pools (per [anything.com pricing docs](https://www.anything.com/docs/account/subscriptions)). Most builders who iterate daily land on a paid tier quickly once the free allowance runs out.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Anything' },
    {
      type: 'compare',
      competitor: 'Anything',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$24/mo Pro ($199/mo Max)' },
        { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — monthly credits' },
        { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Wired in' },
        { feature: 'Deployed URL', freebuff: 'Yes, free', competitor: 'Yes (paid for private)' },
        { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Pro plan and above' },
        { feature: 'Eject to GitHub', freebuff: 'One click', competitor: 'Yes' },
        { feature: 'Paired CLI agent', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
        { feature: 'Mobile app publishing', freebuff: 'Web-first (PWA)', competitor: 'App Store on Pro+' },
      ],
    },
    { type: 'h2', text: 'When Anything is still the better pick' },
    {
      type: 'p',
      text: 'Anything is strong if you need native mobile + web from one project, or you are migrating from Mocha with their one-click import.',
    },
    { type: 'h2', text: 'How to move from Anything to Freebuff' },
    {
      type: 'ol',
      items: [
        'Export to GitHub from Anything, or start fresh in Freebuff Web with the same prompt.',
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
      title: 'Try the free alternative to Anything',
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
          q: 'Can Freebuff do everything Anything does?',
          a: 'For the core loop — prompt, iterate, deploy a real app with auth and database — yes. Niche integrations may differ; you can always import code and extend in the Freebuff CLI.',
        },
        {
          q: 'How much does Anything cost per year on a typical paid plan?',
          a: 'At $24/mo (Pro, monthly billing), expect roughly $288/year before overages. Freebuff is $0.',
        },
        {
          q: 'Can I import my existing Anything project?',
          a: 'Yes — export to GitHub from Anything (where supported) and import into Freebuff Web. We auto-detect the stack.',
        },
      ],
    },
  ],
}
