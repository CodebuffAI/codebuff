import type { Post } from '../types'

export const post: Post = {
  slug: 'save-600-per-year-aura-build-ai-website-builder-freebuff-alternative',
  title: 'How one Aura user saved $600 by switching to Freebuff',
  subtitle: 'Same shipped apps. $50/mo Aura Max bill → $0.',
  description:
    'A real-world savings breakdown: what Aura costs on Aura Max ($50/mo) vs Freebuff Web ($0), and how a freelance designer building client sites kept shipping.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'aura savings',
    'switch from aura to freebuff',
    'aura pricing',
    'aura vs freebuff cost',
    'free aura alternative',
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
        'Aura Max on Aura: about $50/month ($600/year).',
        'Freebuff Web: $0/month for the same prompt → deployed app loop with auth, database, and hosting.',
        'Net savings: $600/year before credit top-ups or seat multipliers.',
        'This is a modeled example for a typical solo builder — your mileage depends on usage.',
      ],
    },
    {
      type: 'lede',
      text: 'We talk to builders every week who like Aura but hate watching credits disappear. Here is a straightforward math story for a freelance designer building client sites — not a fabricated testimonial, but the kind of switch we see in practice.',
    },
    { type: 'h2', text: 'The bill on Aura Max' },
    {
      type: 'p',
      text: 'Aura Pro is $25/mo (120 prompts/mo). Max is $50/mo (240 prompts/mo). Ultra is $100/mo (560 prompts/mo) per [aura.build/pricing](https://www.aura.build/pricing). Annual plans are 50% off while subscribed. For this example we use the middle paid tier most solo builders aim for: **Aura Max at $50/month**, or **$600/year**.',
    },
    {
      type: 'compare',
      competitor: 'Aura Max',
      rows: [
        { feature: 'Monthly subscription', freebuff: '$0', competitor: '$50' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$600' },
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
        '**$600/year back.** That covers domains, email, or a connected ChatGPT subscription for hard turns.',
      ],
    },
    { type: 'h2', text: 'Three-step migration' },
    {
      type: 'ol',
      items: [
        'Export HTML or push code to GitHub, then import into Freebuff Web for backend features.',
        'Import the repo into Freebuff Web (or recreate the app with your best prompt).',
        'Cancel Aura once you have verified the Freebuff deploy — welcome to $0/month.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Want the full feature comparison?',
      text: 'Read [The free alternative to Aura](/blog/free-aura-build-ai-website-builder-alternative-freebuff) for an honest side-by-side.',
    },
    {
      type: 'cta',
      title: 'Stop paying $50/mo',
      description: 'Open Freebuff Web and ship your next app for free.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is $600/year realistic?',
          a: 'It is the base subscription for Aura Max. Many users pay more after credit top-ups, extra seats, or higher tiers.',
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
