import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-windsurf',
  title: 'The free alternative to Windsurf',
  subtitle: 'A free agentic IDE experience, without the $15/mo seat.',
  description:
    'Freebuff is a free alternative to Windsurf — a CLI coding agent with cascade-style autonomy, subagents, and model choice. Pairs with VS Code, JetBrains, and any terminal.',
  category: 'Comparisons',
  publishedAt: '2026-04-23',
  readingMinutes: 6,
  authorId: 'freebuff-team',
  keywords: [
    'free windsurf',
    'free windsurf alternative',
    'windsurf free',
    'codeium windsurf free',
    'windsurf cascade alternative',
    'windsurf vs freebuff',
    'free agentic ide',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is a free alternative to Windsurf with the same agentic, multi-file autonomy.',
        'Windsurf Pro is $15/mo (and rising on enterprise). Freebuff is $0.',
        'You get 9 specialized subagents and the freedom to switch models per task.',
        'Editor-agnostic — works in VS Code, JetBrains, Vim, or a bare terminal.',
      ],
    },
    {
      type: 'lede',
      text: 'Windsurf\u2019s Cascade made multi-file autonomous edits feel safe. Freebuff has the same cadence — plan, edit, run, verify — without the seat license.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff vs Windsurf' },
    {
      type: 'compare',
      competitor: 'Windsurf Pro',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$15+/mo per seat' },
        { feature: 'Editor lock-in', freebuff: 'None — works anywhere', competitor: 'Windsurf IDE (Codeium)' },
        { feature: 'Models', freebuff: 'DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7, GPT-5.4 (BYOK)', competitor: 'Codeium-curated set' },
        { feature: 'Subagents', freebuff: '9 specialized', competitor: 'General Cascade agent' },
        { feature: 'Browser-use subagent', freebuff: 'Built-in', competitor: 'No' },
        { feature: 'BYOK ChatGPT', freebuff: 'Yes', competitor: 'No' },
        { feature: 'Codebase indexing', freebuff: 'Local + free', competitor: 'Cloud + metered' },
      ],
    },
    { type: 'h2', text: 'When Windsurf still wins' },
    {
      type: 'ul',
      items: [
        '**You love the cascade panel UI.** Windsurf\u2019s diff review is polished.',
        '**Team seats with enterprise SSO.** Windsurf has paperwork Freebuff does not match yet.',
      ],
    },
    { type: 'h2', text: 'When Freebuff wins' },
    {
      type: 'ul',
      items: [
        '**You want to use any editor.** Freebuff lives in your terminal — bring whichever IDE you like.',
        '**You want to control model spend.** Switch per task with `/model`.',
        '**You want browser automation in the agent.** Freebuff ships it natively.',
        '**You do not want a seat license.** $0 vs $15/mo per seat scales differently.',
      ],
    },
    {
      type: 'cta',
      title: 'Get the free alternative to Windsurf',
      description: 'Install Freebuff with one npm command.',
      href: '/',
      label: 'See the install command',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Will Freebuff replace my IDE like Windsurf does?',
          a: 'No — Freebuff is an agent that lives in your terminal. Keep VS Code, JetBrains, or Vim, and run `freebuff` in the integrated terminal.',
        },
        {
          q: 'Does Freebuff have cascade-style multi-file edits?',
          a: 'Yes. Freebuff plans across files first, then applies edits in a single pass you can review and approve.',
        },
      ],
    },
  ],
}
