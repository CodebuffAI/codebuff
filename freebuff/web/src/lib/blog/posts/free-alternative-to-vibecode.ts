import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-vibecode',
  title: 'The free alternative to VibeCode',
  subtitle: 'Ship a full-stack app from a prompt — without the prompt-credit ceiling.',
  description:
    'Freebuff Web is the free alternative to VibeCode. Prompt → deployed full-stack app, with auth, database, file storage, and hosting included, and no per-prompt credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-05-16',
  readingMinutes: 6,
  authorId: 'victor-cheng',
  keywords: [
    'free vibecode',
    'vibecode alternative',
    'vibecode free',
    'vibecode vs freebuff',
    'free vibe coding',
    'free ai app builder',
    'free full stack app builder',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'VibeCode helped popularize "vibe coding" — type a vibe, get an app.',
        'Freebuff Web does the same loop, no credit meter, no daily cap.',
        'Auth, DB, file storage, and hosting are included by default.',
        'Eject to GitHub at any time and keep editing with the Freebuff CLI.',
      ],
    },
    {
      type: 'lede',
      text: 'VibeCode\u2019s pitch is great — describe the vibe, ship the app. Freebuff Web is the same pitch with the bill removed.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs VibeCode' },
    {
      type: 'compare',
      competitor: 'VibeCode',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'Free tier capped; paid above' },
        { feature: 'Credit meter', freebuff: 'None', competitor: 'Per-prompt credits' },
        { feature: 'Auth + database', freebuff: 'Included by default', competitor: 'Add-on / paid' },
        { feature: 'Deployed URL per change', freebuff: 'Yes', competitor: 'Yes' },
        { feature: 'Eject to GitHub', freebuff: 'One click, repo is yours', competitor: 'Limited / paid' },
        { feature: 'Paired CLI agent', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
        { feature: 'BYOK ChatGPT for deep thinking', freebuff: 'Yes', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'What you keep' },
    {
      type: 'ul',
      items: [
        '**Prompt-to-app speed** — the loop that made vibe coding fun.',
        '**Live preview** that updates per prompt.',
        '**Visual iteration** for non-engineers.',
      ],
    },
    { type: 'h2', text: 'What you gain' },
    {
      type: 'ul',
      items: [
        '**No credit ceiling.**',
        '**A real database + auth** wired in from the first prompt.',
        '**A CLI for heavy refactors** when the visual editor reaches its limit.',
      ],
    },
    {
      type: 'cta',
      title: 'Vibe code for free',
      description: 'Spin up a full-stack app with no credits or signups in the way.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Can I import my VibeCode project to Freebuff?',
          a: 'Yes — export to GitHub from VibeCode, then Import from GitHub in Freebuff Web.',
        },
        {
          q: 'Does Freebuff support the same visual editing?',
          a: 'Yes. Edit by prompt, or use the in-browser file editor + element inspector. Iterate visually, then commit when ready.',
        },
      ],
    },
  ],
}
