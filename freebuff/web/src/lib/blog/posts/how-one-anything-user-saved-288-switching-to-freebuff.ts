import type { Post } from '../types'

export const post: Post = {
  slug: 'how-one-anything-user-saved-288-switching-to-freebuff',
  title: 'How one Anything user saved $288 by switching to Freebuff',
  subtitle: 'Same shipped apps. $24/mo Anything Pro bill → $0.',
  description:
    'A real-world savings breakdown: what Anything costs on Anything Pro ($24/mo) vs Freebuff Web ($0), and how an indie hacker shipping side projects kept shipping.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'anything savings',
    'switch from anything to freebuff',
    'anything pricing',
    'anything vs freebuff cost',
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
        'Anything Pro on Anything: about $24/month ($288/year).',
        'Freebuff Web: $0/month for the same prompt → deployed app loop with auth, database, and hosting.',
        'Net savings: $288/year before credit top-ups or seat multipliers.',
        'This is a modeled example for a typical solo builder — your mileage depends on usage.',
      ],
    },
    {
      type: 'lede',
      text: 'We talk to builders every week who like Anything but hate watching credits disappear. Here is a straightforward math story for an indie hacker shipping side projects — not a fabricated testimonial, but the kind of switch we see in practice.',
    },
    { type: 'h2', text: 'The bill on Anything Pro' },
    {
      type: 'p',
      text: 'Anything Pro is $19/mo billed annually or $24/mo billed monthly for 20,000 monthly credits. The Max tier jumps to $199–$239/mo for parallel agents and higher credit pools (per [anything.com pricing docs](https://www.anything.com/docs/account/subscriptions)). For this example we use the middle paid tier most solo builders aim for: **Anything Pro at $24/month**, or **$288/year**.',
    },
    {
      type: 'compare',
      competitor: 'Anything Pro',
      rows: [
        { feature: 'Monthly subscription', freebuff: '$0', competitor: '$24' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$288' },
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
        '**$288/year back.** That covers domains, email, or a connected ChatGPT subscription for hard turns.',
      ],
    },
    { type: 'h2', text: 'Three-step migration' },
    {
      type: 'ol',
      items: [
        'Export to GitHub from Anything, or start fresh in Freebuff Web with the same prompt.',
        'Import the repo into Freebuff Web (or recreate the app with your best prompt).',
        'Cancel Anything once you have verified the Freebuff deploy — welcome to $0/month.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Want the full feature comparison?',
      text: 'Read [The free alternative to Anything](/blog/free-alternative-to-anything) for an honest side-by-side.',
    },
    {
      type: 'cta',
      title: 'Stop paying $24/mo',
      description: 'Open Freebuff Web and ship your next app for free.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is $288/year realistic?',
          a: 'It is the base subscription for Anything Pro. Many users pay more after credit top-ups, extra seats, or higher tiers.',
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
