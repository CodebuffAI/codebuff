import type { Post } from '../types'

export const post: Post = {
  slug: 'free-aura-build-ai-website-builder-alternative-freebuff',
  title: 'The free alternative to Aura',
  subtitle: 'Same prompt-to-deployed-app loop — without the $50/mo (Max) bill.',
  description:
    'Freebuff Web is the free alternative to Aura. Build full-stack apps with auth, database, and hosting included — 100% free, no credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  keywords: [
    'free aura.build alternative',
    'aura.build ai website builder',
    'aura ai landing page builder',
    'aura.build free',
    'aura ai website builder',
    'aura build ai',
    'aura ai design tool free',
    'aura vs lovable',
    'aura.build pricing alternative',
    'aura vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web is a free alternative to Aura — prompt to deployed full-stack app.',
        'Aura typical paid tier: $50/mo (Max). Freebuff Web is $0.',
        'Auth, database, file storage, hosting, and a paired CLI are included.',
        'You own the code — eject to GitHub any time.',

      ],
    },
    {
      type: 'lede',
      text: 'Aura (aura.build) is a design-first AI website builder with premium templates, Figma export, and CMS features. Freebuff Web does the same job without a subscription or credit meter.',
    },
    { type: 'h2', text: 'What Aura costs in 2026' },
    {
      type: 'p',
      text: 'Aura Pro is $25/mo (120 prompts/mo). Max is $50/mo (240 prompts/mo). Ultra is $100/mo (560 prompts/mo) per [aura.build/pricing](https://www.aura.build/pricing). Annual plans are 50% off while subscribed. Most builders who iterate daily land on a paid tier quickly once the free allowance runs out.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs Aura' },
    {
      type: 'compare',
      competitor: 'Aura',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$50/mo (Max)' },
        { feature: 'Prompt/message limits', freebuff: 'None', competitor: '240/mo on Max' },
        { feature: 'Full-stack backend', freebuff: 'Wired in', competitor: 'CMS-focused' },
        { feature: 'Figma export', freebuff: 'Via import', competitor: 'Native on paid' },
        { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Paid plans' },
        { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'When Aura is still the better pick' },
    {
      type: 'p',
      text: 'Aura wins for visually polished marketing sites where design templates and Figma handoff matter more than backend depth.',
    },
    { type: 'h2', text: 'How to move from Aura to Freebuff' },
    {
      type: 'ol',
      items: [
        'Export HTML or push code to GitHub, then import into Freebuff Web for backend features.',
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
      title: 'Try the free alternative to Aura',
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
          q: 'Can Freebuff do everything Aura does?',
          a: 'For the core loop — prompt, iterate, deploy a real app with auth and database — yes. Niche integrations may differ; you can always import code and extend in the Freebuff CLI.',
        },
        {
          q: 'How much does Aura cost per year on a typical paid plan?',
          a: 'At $50/mo (Max), expect roughly $600/year before overages. Freebuff is $0.',
        },
        {
          q: 'Can I import my existing Aura project?',
          a: 'Yes — export to GitHub from Aura (where supported) and import into Freebuff Web. We auto-detect the stack.',
        },
      ],
    },
  ],
}
