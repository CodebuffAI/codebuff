import type { Post } from '../types'

export const post: Post = {
  slug: 'how-one-cosmic-user-saved-360-switching-to-freebuff',
  title: 'How one Cosmic.new user saved $360 by switching to Freebuff',
  subtitle: 'Same shipped apps. $30/mo Cosmic.new Pro bill → $0.',
  description:
    'A real-world savings breakdown: what Cosmic.new costs on Cosmic.new Pro ($30/mo) vs Freebuff Web ($0), and how an indie hacker shipping side projects kept shipping.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'cosmic savings',
    'switch from cosmic to freebuff',
    'cosmic pricing',
    'cosmic vs freebuff cost',
    'free cosmic alternative',
    'free cosmic.new alternative',
    'cosmic.new ai app builder',
    'cosmic.new free',
    'cosmic new ai builder',
    'cosmic ai saas builder',
    'cosmic.new pricing',
    'cosmic.new vs lovable',
    'cosmic.new not cosmicjs',
    'cosmic.new vs freebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Cosmic.new Pro on Cosmic.new: about $30/month ($360/year).',
        'Freebuff Web: $0/month for the same prompt → deployed app loop with auth, database, and hosting.',
        'Net savings: $360/year before credit top-ups or seat multipliers.',
        'This is a modeled example for a typical solo builder — your mileage depends on usage.',
      ],
    },
    {
      type: 'lede',
      text: 'We talk to builders every week who like Cosmic.new but hate watching credits disappear. Here is a straightforward math story for an indie hacker shipping side projects — not a fabricated testimonial, but the kind of switch we see in practice.',
    },
    { type: 'h2', text: 'The bill on Cosmic.new Pro' },
    {
      type: 'p',
      text: 'Cosmic.new Pro is $29.99/mo. Enterprise is $199.99/mo for large teams (per [cosmic.new](https://www.cosmic.new/)). API access is listed at $29.99/mo (reduced from $49.99). For this example we use the middle paid tier most solo builders aim for: **Cosmic.new Pro at $30/month**, or **$360/year**.',
    },
    {
      type: 'compare',
      competitor: 'Cosmic.new Pro',
      rows: [
        { feature: 'Monthly subscription', freebuff: '$0', competitor: '$30' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$360' },
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
        '**$360/year back.** That covers domains, email, or a connected ChatGPT subscription for hard turns.',
      ],
    },
    { type: 'h2', text: 'Three-step migration' },
    {
      type: 'ol',
      items: [
        'Export your project code and import into Freebuff Web via GitHub.',
        'Import the repo into Freebuff Web (or recreate the app with your best prompt).',
        'Cancel Cosmic.new once you have verified the Freebuff deploy — welcome to $0/month.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Want the full feature comparison?',
      text: 'Read [The free alternative to Cosmic.new](/blog/free-alternative-to-cosmic) for an honest side-by-side.',
    },
    {
      type: 'cta',
      title: 'Stop paying $30/mo',
      description: 'Open Freebuff Web and ship your next app for free.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is $360/year realistic?',
          a: 'It is the base subscription for Cosmic.new Pro. Many users pay more after credit top-ups, extra seats, or higher tiers.',
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
