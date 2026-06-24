import type { Post } from '../types'

export const post: Post = {
  slug: 'how-one-figma-make-user-saved-240-switching-to-freebuff',
  title: 'How one Figma Make user saved $240 by switching to Freebuff',
  subtitle: 'Same shipped apps. $20/mo Figma Professional Full seat bill → $0.',
  description:
    'A real-world savings breakdown: what Figma Make costs on Figma Professional Full seat ($20/mo) vs Freebuff Web ($0), and how a marketer shipping client landing pages kept shipping.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'figma-make savings',
    'switch from figma-make to freebuff',
    'figma-make pricing',
    'figma-make vs freebuff cost',
    'free figma-make alternative',
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
        'Figma Professional Full seat on Figma Make: about $20/month ($240/year).',
        'Freebuff Web: $0/month for the same prompt → deployed app loop with auth, database, and hosting.',
        'Net savings: $240/year before credit top-ups or seat multipliers.',
        'This is a modeled example for a typical solo builder — your mileage depends on usage.',
      ],
    },
    {
      type: 'lede',
      text: 'We talk to builders every week who like Figma Make but hate watching credits disappear. Here is a straightforward math story for a marketer shipping client landing pages — not a fabricated testimonial, but the kind of switch we see in practice.',
    },
    { type: 'h2', text: 'The bill on Figma Professional Full seat' },
    {
      type: 'p',
      text: 'Figma Make is bundled into Figma seat pricing — not sold separately. A Professional Full seat is ~$16–20/mo (annual vs monthly) with 3,000 AI credits/mo shared across Figma AI tools. Organization Full is $55/seat/mo (per [figma.com/pricing](https://www.figma.com/pricing)). For this example we use the middle paid tier most solo builders aim for: **Figma Professional Full seat at $20/month**, or **$240/year**.',
    },
    {
      type: 'compare',
      competitor: 'Figma Professional Full seat',
      rows: [
        { feature: 'Monthly subscription', freebuff: '$0', competitor: '$20' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$240' },
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
        '**$240/year back.** That covers domains, email, or a connected ChatGPT subscription for hard turns.',
      ],
    },
    { type: 'h2', text: 'Three-step migration' },
    {
      type: 'ol',
      items: [
        'Export code from Figma Make, push to GitHub, and import into Freebuff Web for auth, database, and hosting.',
        'Import the repo into Freebuff Web (or recreate the app with your best prompt).',
        'Cancel Figma Make once you have verified the Freebuff deploy — welcome to $0/month.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Want the full feature comparison?',
      text: 'Read [The free alternative to Figma Make](/blog/free-alternative-to-figma-make) for an honest side-by-side.',
    },
    {
      type: 'cta',
      title: 'Stop paying $20/mo',
      description: 'Open Freebuff Web and ship your next app for free.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is $240/year realistic?',
          a: 'It is the base subscription for Figma Professional Full seat. Many users pay more after credit top-ups, extra seats, or higher tiers.',
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
