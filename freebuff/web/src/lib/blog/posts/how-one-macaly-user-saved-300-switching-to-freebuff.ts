import type { Post } from '../types'

export const post: Post = {
  slug: 'how-one-macaly-user-saved-300-switching-to-freebuff',
  title: 'How one Macaly user saved $300 by switching to Freebuff',
  subtitle: 'Same shipped apps. $25/mo Macaly Pro bill → $0.',
  description:
    'A real-world savings breakdown: what Macaly costs on Macaly Pro ($25/mo) vs Freebuff Web ($0), and how an indie hacker shipping side projects kept shipping.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'macaly savings',
    'switch from macaly to freebuff',
    'macaly pricing',
    'macaly vs freebuff cost',
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
        'Macaly Pro on Macaly: about $25/month ($300/year).',
        'Freebuff Web: $0/month for the same prompt → deployed app loop with auth, database, and hosting.',
        'Net savings: $300/year before credit top-ups or seat multipliers.',
        'This is a modeled example for a typical solo builder — your mileage depends on usage.',
      ],
    },
    {
      type: 'lede',
      text: 'We talk to builders every week who like Macaly but hate watching credits disappear. Here is a straightforward math story for an indie hacker shipping side projects — not a fabricated testimonial, but the kind of switch we see in practice.',
    },
    { type: 'h2', text: 'The bill on Macaly Pro' },
    {
      type: 'p',
      text: 'Macaly Pro is $25/mo with custom domains, code access, and monthly AI credits. Enterprise is custom. A $5/mo Hosting-only plan keeps domains live without AI credits (per [macaly.com/pricing](https://www.macaly.com/pricing)). For this example we use the middle paid tier most solo builders aim for: **Macaly Pro at $25/month**, or **$300/year**.',
    },
    {
      type: 'compare',
      competitor: 'Macaly Pro',
      rows: [
        { feature: 'Monthly subscription', freebuff: '$0', competitor: '$25' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$300' },
        { feature: 'Credit / token overages', freebuff: 'None', competitor: 'Common on active projects' },
        { feature: 'Auth + database + hosting', freebuff: 'Included', competitor: 'Included (varies by plan)' },
        { feature: 'CLI for big refactors', freebuff: 'Freebuff CLI', competitor: 'Not included' },
      ],
    },
    { type: 'h2', text: 'What changed after switching' },
    {
      type: 'ul',
      items: [
        '**Same workflow.** Prompt in the browser, get a deployed URL, click to iterate.',
        '**No rationing.** Heavy debugging weekends do not burn a credit balance.',
        '**GitHub eject any time.** The repo is yours; keep editing in Freebuff CLI locally.',
        '**$300/year back.** That covers domains, email, or a connected ChatGPT subscription for hard turns.',
      ],
    },
    { type: 'h2', text: 'Three-step migration' },
    {
      type: 'ol',
      items: [
        'Export code from Macaly Pro and import the repo into Freebuff Web.',
        'Import the repo into Freebuff Web (or recreate the app with your best prompt).',
        'Cancel Macaly once you have verified the Freebuff deploy — welcome to $0/month.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Want the full feature comparison?',
      text: 'Read [The free alternative to Macaly](/blog/free-alternative-to-macaly) for an honest side-by-side.',
    },
    {
      type: 'cta',
      title: 'Stop paying $25/mo',
      description: 'Open Freebuff Web and ship your next app for free.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is $300/year realistic?',
          a: 'It is the base subscription for Macaly Pro. Many users pay more after credit top-ups, extra seats, or higher tiers.',
        },
        {
          q: 'Will I lose features?',
          a: 'You keep auth, database, hosting, and code ownership. Some vendor-specific integrations may need re-wiring — usually a one-time CLI task.',
        },
        {
          q: 'Can teams use Freebuff for free too?',
          a: 'Yes. No per-seat pricing on Freebuff Web. Collaborate via GitHub like any normal repo.',
        },
      ],
    },
  ],
}
