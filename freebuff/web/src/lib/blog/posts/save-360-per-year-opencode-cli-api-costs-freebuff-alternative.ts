import type { Post } from '../types'

export const post: Post = {
  slug: 'save-360-per-year-opencode-cli-api-costs-freebuff-alternative',
  title: 'How one OpenCode user saved $360 by switching to Freebuff CLI',
  subtitle: '$30/mo typical API spend → $0 with Freebuff.',
  description:
    'Savings breakdown: OpenCode at ~$30/mo (model APIs) vs Freebuff CLI at $0. A modeled example for terminal-first developers.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
keywords: [
    'opencode savings',
    'switch from opencode to freebuff',
    'opencode pricing',
    'opencode vs freebuff cost',
    'free opencode alternative',
    'free opencode cli',
    'opencode cli alternative',
    'sst opencode free',
    'opencode coding agent',
    'opencode vs freebuff',
    'free open source cli coding agent',
    'opencode cli byok alternative',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'typical API spend on OpenCode: about $30/month ($360/year).',
        'Freebuff CLI: $0/month with models and subagents included.',
        'Net savings: $360/year before API or credit overages.',
        'Modeled example — your usage may differ.',
      ],
    },
    {
      type: 'lede',
      text: 'Terminal agents are where subscription and token costs add up fastest. Here is the math for OpenCode vs Freebuff CLI — not a fabricated testimonial, but the switch we see often.',
    },
    { type: 'h2', text: 'The bill on typical API spend' },
    {
      type: 'p',
      text: 'OpenCode is free software but **BYOK** — most users pay **$20–$50/mo** to model providers depending on volume. For this example: **$30/month** or **$360/year**.',
    },
    {
      type: 'compare',
      competitor: 'typical API spend',
      rows: [
        { feature: 'Monthly cost', freebuff: '$0', competitor: '$30' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$360' },
        { feature: 'Token / credit overages', freebuff: 'None', competitor: 'Common on long agent sessions' },
        { feature: 'Subagents', freebuff: '9 included', competitor: 'Varies' },
        { feature: 'Model bundle', freebuff: 'Included', competitor: 'Subscription or BYOK' },
      ],
    },
    { type: 'h2', text: 'Three-step switch' },
    {
      type: 'ol',
      items: [
        'Keep your repo; swap the CLI command to `freebuff`.',
        'Install Freebuff: `npm i -g freebuff`',
        'Cancel OpenCode billing once you have verified Freebuff on your repos.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Full comparison',
      text: 'Read [The free alternative to OpenCode](/blog/free-opencode-cli-coding-agent-alternative-freebuff) for the feature-by-feature table.',
    },
    {
      type: 'cta',
      title: 'Stop paying $30/mo',
      href: '/cli',
      label: 'Install Freebuff CLI',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Can I run both Copilot CLI and Freebuff?',
          a: 'Yes. Many developers use Freebuff for heavy agent work and keep IDE completions elsewhere — or drop the paid tier entirely.',
        },
        {
          q: 'Do I need to change editors?',
          a: 'No. Freebuff runs in whatever terminal you already use.',
        },
      ],
    },
  ],
}
