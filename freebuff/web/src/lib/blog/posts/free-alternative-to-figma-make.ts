import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-figma-make',
  title: 'The free alternative to Figma Make',
  subtitle: 'Same prompt-to-deployed-app loop — without the $20/mo (Professional Full seat) bill.',
  description:
    'Freebuff Web is the free alternative to Figma Make. Build full-stack apps with auth, database, and hosting included — 100% free, no credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  keywords: [
    'free figma make alternative',
    'figma make ai app builder',
    'figma ai app builder',
    'figma make free',
    'figma make pricing',
    'figma prompt to app',
    'figma make vs lovable',
    'figma make vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web is a free alternative to Figma Make — prompt to deployed full-stack app.',
        'Figma Make typical paid tier: $20/mo (Professional Full seat). Freebuff Web is $0.',
        'Auth, database, file storage, hosting, and a paired CLI are included.',
        'You own the code — eject to GitHub any time.',

      ],
    },
    {
      type: 'lede',
      text: 'Figma Make turns designs and prompts into functional web apps inside Figma, with code export and beta publishing. Freebuff Web does the same job without a subscription or credit meter.',
    },
    { type: 'h2', text: 'What Figma Make costs in 2026' },
    {
      type: 'p',
      text: 'Figma Make is bundled into Figma seat pricing — not sold separately. A Professional Full seat is ~$16–20/mo (annual vs monthly) with 3,000 AI credits/mo shared across Figma AI tools. Organization Full is $55/seat/mo (per [figma.com/pricing](https://www.figma.com/pricing)). Most builders who iterate daily land on a paid tier quickly once the free allowance runs out.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Figma Make' },
    {
      type: 'compare',
      competitor: 'Figma Make',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$20/mo+ (Figma Full seat)' },
        { feature: 'Requires Figma subscription', freebuff: 'No', competitor: 'Yes for production use' },
        { feature: 'AI credit pool', freebuff: 'None — no meter', competitor: '3,000 credits/mo (Pro Full)' },
        { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Add backend manually' },
        { feature: 'Standalone deployed URL', freebuff: 'Yes, free', competitor: 'Beta publishing in Figma' },
        { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'When Figma Make is still the better pick' },
    {
      type: 'p',
      text: 'Figma Make wins when your team already pays for Figma Full seats and wants app experiments adjacent to design files.',
    },
    { type: 'h2', text: 'How to move from Figma Make to Freebuff' },
    {
      type: 'ol',
      items: [
        'Export code from Figma Make, push to GitHub, and import into Freebuff Web for auth, database, and hosting.',
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
      title: 'Try the free alternative to Figma Make',
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
          q: 'Can Freebuff do everything Figma Make does?',
          a: 'For the core loop — prompt, iterate, deploy a real app with auth and database — yes. Niche integrations may differ; you can always import code and extend in the Freebuff CLI.',
        },
        {
          q: 'How much does Figma Make cost per year on a typical paid plan?',
          a: 'At $20/mo (Professional Full seat), expect roughly $240/year before overages. Freebuff is $0.',
        },
        {
          q: 'Can I import my existing Figma Make project?',
          a: 'Yes — export to GitHub from Figma Make (where supported) and import into Freebuff Web. We auto-detect the stack.',
        },
      ],
    },
  ],
}
