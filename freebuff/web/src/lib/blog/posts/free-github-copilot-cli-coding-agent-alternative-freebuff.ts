import type { Post } from '../types'

export const post: Post = {
  slug: 'free-github-copilot-cli-coding-agent-alternative-freebuff',
  title: 'The free alternative to GitHub Copilot CLI',
  subtitle: 'Same CLI agent loop — without the $39/mo (Copilot Pro+) bill.',
  description:
    'Freebuff is the free alternative to GitHub Copilot CLI. CLI coding agent with subagents, slash commands, and included models — $0/month.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'freebuff-team',
keywords: [
    'free github copilot cli',
    'github copilot cli alternative',
    'copilot cli coding agent',
    'github copilot cli pricing',
    'copilot cli vs freebuff',
    'free copilot cli alternative',
    'github copilot agent cli free',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is a free alternative to GitHub Copilot CLI — same terminal agent loop.',
        'GitHub Copilot CLI typical cost: $39/mo (Copilot Pro+). Freebuff CLI is $0.',
        '9 subagents, slash commands, and frontier models included — no API key required to start.',
        'Runs in any editor terminal: VS Code, JetBrains, Vim, Cursor, or bare shell.',
      ],
    },
    {
      type: 'lede',
      text: 'GitHub Copilot CLI is GitHub\'s terminal agent: plan, edit, run shell commands, and open PRs — tied to your GitHub account and Copilot subscription. Freebuff does the same job with models and subagents bundled in — no subscription or per-token meter on day one.',
    },
    { type: 'h2', text: 'What GitHub Copilot CLI costs in 2026' },
    {
      type: 'p',
      text: 'GitHub Copilot CLI is included on all Copilot plans. **Copilot Pro is $10/mo**; **Copilot Pro+ is $39/mo** with a larger AI Credits pool. As of June 2026, usage is metered in GitHub AI Credits (1 credit = $0.01) per token — heavy agent sessions can burn through included credits fast (per [GitHub Copilot billing docs](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)).',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff CLI vs GitHub Copilot CLI' },
    {
      type: 'compare',
      competitor: 'GitHub Copilot CLI',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$10–$39/mo + credit overages' },
        { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — AI Credits per token' },
        { feature: 'Model choice', freebuff: 'Multiple included + ChatGPT connect', competitor: 'Copilot model menu' },
        { feature: 'Subagents', freebuff: '9 specialized', competitor: 'Single agent' },
        { feature: 'Editor lock-in', freebuff: 'None — any terminal', competitor: 'None — CLI' },
        { feature: 'GitHub integration', freebuff: 'Via `gh` CLI / /pr', competitor: 'Native GitHub' },
      ],
    },
    { type: 'h2', text: 'When GitHub Copilot CLI is still the better pick' },
    {
      type: 'p',
      text: 'Copilot CLI wins if your team already pays for Copilot Enterprise, needs GitHub-native PR flows, and wants usage pooled at the org level.',
    },
    { type: 'h2', text: 'How to switch from GitHub Copilot CLI to Freebuff' },
    {
      type: 'ol',
      items: [
        'Clone your repo locally (if not already), install Freebuff with `npm i -g freebuff`, run `freebuff` in the project root.',
        'Run `npm i -g freebuff` (or use the install script from freebuff.com/cli).',
        'In your repo: `freebuff` — same terminal workflow, $0/month.',
        'Optional: connect ChatGPT for GPT-5.4 on the hardest turns.',
      ],
    },
    {
      type: 'cta',
      title: 'Try the free alternative to GitHub Copilot CLI',
      description: 'Install Freebuff CLI and ship from your terminal for $0.',
      href: '/cli',
      label: 'Install Freebuff CLI',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is Freebuff CLI really free?',
          a: 'Yes. No per-token meter for normal use. Models are included; connect ChatGPT optionally for premium turns.',
        },
        {
          q: 'Can I use Freebuff inside Cursor or VS Code?',
          a: 'Yes — open the integrated terminal and run freebuff. No editor switch required.',
        },
        {
          q: 'How much does GitHub Copilot CLI cost per year?',
          a: 'At $39/mo (Copilot Pro+), expect roughly $468/year before overages. Freebuff is $0.',
        },
      ],
    },
  ],
}
