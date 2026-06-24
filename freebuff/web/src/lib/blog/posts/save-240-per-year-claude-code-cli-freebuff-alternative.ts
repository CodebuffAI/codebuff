import type { Post } from '../types'

export const post: Post = {
  slug: 'save-240-per-year-claude-code-cli-freebuff-alternative',
  title: 'How one Claude Code user saved $240 by switching to Freebuff CLI',
  subtitle: '$20/mo Claude Code Pro → $0 with Freebuff.',
  description:
    'Savings breakdown: Claude Code at $20/mo (Pro) vs Freebuff CLI at $0. A modeled example for terminal-first developers.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
keywords: [
    'claude-code savings',
    'switch from claude-code to freebuff',
    'claude-code pricing',
    'claude-code vs freebuff cost',
    'free claude-code alternative',
    'free claude code cli',
    'free claude code alternative',
    'claude code cli free',
    'claude code alternative',
    'anthropic claude code cli',
    'claude code vs freebuff',
    'free cli coding agent',
    'claude code pro pricing alternative',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Claude Code Pro on Claude Code: about $20/month ($240/year).',
        'Freebuff CLI: $0/month with models and subagents included.',
        'Net savings: $240/year before API or credit overages.',
        'Modeled example — your usage may differ.',
      ],
    },
    {
      type: 'lede',
      text: 'Terminal agents are where subscription and token costs add up fastest. Here is the math for Claude Code vs Freebuff CLI — not a fabricated testimonial, but the switch we see often.',
    },
    { type: 'h2', text: 'The bill on Claude Code Pro' },
    {
      type: 'p',
      text: 'Claude Code Pro is **$20/mo**; Max is **$200/mo**. Pro includes agent access tied to your Anthropic subscription. For this example: **$20/month** or **$240/year**.',
    },
    {
      type: 'compare',
      competitor: 'Claude Code Pro',
      rows: [
        { feature: 'Monthly cost', freebuff: '$0', competitor: '$20' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$240' },
        { feature: 'Token / credit overages', freebuff: 'None', competitor: 'Common on long agent sessions' },
        { feature: 'Subagents', freebuff: '9 included', competitor: 'Varies' },
        { feature: 'Model bundle', freebuff: 'Included', competitor: 'Subscription or BYOK' },
      ],
    },
    { type: 'h2', text: 'Three-step switch' },
    {
      type: 'ol',
      items: [
        'Same repo, same terminal — run `freebuff` instead of `claude`.',
        'Install Freebuff: `npm i -g freebuff`',
        'Cancel Claude Code billing once you have verified Freebuff on your repos.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Full comparison',
      text: 'Read [The free alternative to Claude Code](/blog/free-claude-code-cli-coding-agent-alternative-freebuff) for the feature-by-feature table.',
    },
    {
      type: 'cta',
      title: 'Stop paying $20/mo',
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
