import type { Post } from '../types'

export const post: Post = {
  slug: 'switch-from-cursor-to-freebuff',
  title: 'Switch from Cursor to Freebuff in 5 minutes',
  subtitle: 'A no-disruption migration: keep your editor, drop the subscription.',
  description:
    'Step-by-step guide to migrating from Cursor to Freebuff in 5 minutes. Keep your editor, ditch the subscription, and get a more capable agent on the way.',
  category: 'Guides',
  publishedAt: '2026-05-09',
  readingMinutes: 5,
  authorId: 'james-grugett',
  keywords: [
    'switch from cursor to freebuff',
    'cursor to freebuff migration',
    'free cursor alternative',
    'cancel cursor subscription',
    'cursor alternative free',
    'replace cursor',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'You don\u2019t need to change editors — Freebuff runs in any terminal.',
        'Total time: ~5 minutes.',
        'Cost after switch: $0/month.',
      ],
    },
    { type: 'h2', text: 'Step 1: Install Freebuff' },
    {
      type: 'code',
      lang: 'bash',
      code: 'npm install -g freebuff',
    },
    {
      type: 'p',
      text: 'Or run without install: `npx freebuff@latest`.',
    },
    { type: 'h2', text: 'Step 2: Open a project + start Freebuff' },
    {
      type: 'code',
      lang: 'bash',
      code: 'cd ~/code/my-app\nfreebuff',
    },
    {
      type: 'p',
      text: 'Freebuff indexes the repo locally on first run. No upload, no cloud sync.',
    },
    { type: 'h2', text: 'Step 3: Pin Freebuff side-by-side with your editor' },
    {
      type: 'ul',
      items: [
        '**VS Code / Cursor:** open the built-in terminal (`Ctrl+\u0060`) and run `freebuff`. Drag the terminal panel to the side for a vertical split.',
        '**JetBrains:** open the terminal tool window (`Alt+F12`).',
        '**Vim/Neovim:** use a tmux split or `:terminal`.',
      ],
    },
    { type: 'h2', text: 'Step 4: Map your common Cursor flows to Freebuff' },
    {
      type: 'compare',
      competitor: 'Cursor',
      rows: [
        { feature: 'Inline edit (\u2318K)', freebuff: 'Highlight in CLI prompt + describe change', competitor: '\u2318K' },
        { feature: 'Chat / agent', freebuff: 'Prompt at top of Freebuff CLI', competitor: '\u2318L Composer' },
        { feature: 'Codebase Q&A', freebuff: '`/ask <question>`', competitor: '@codebase' },
        { feature: 'Browser preview', freebuff: '`/browser` (built-in)', competitor: 'External' },
        { feature: 'Multi-file refactor', freebuff: '`/plan` then accept', competitor: 'Composer plan' },
        { feature: 'Model switch', freebuff: '`/model`', competitor: 'Model menu' },
      ],
    },
    { type: 'h2', text: 'Step 5: Cancel your Cursor subscription' },
    {
      type: 'p',
      text: 'In Cursor: Settings → Billing → Cancel. You\u2019re done. Welcome to $0/month.',
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'You can keep Cursor too',
      text: 'Nothing breaks if you keep Cursor installed alongside Freebuff. Many engineers use Cursor\u2019s tab-completion + Freebuff\u2019s agent loop together for free.',
    },
    {
      type: 'cta',
      title: 'Make the switch',
      description: 'Install Freebuff once. Free forever.',
      href: '/',
      label: 'Install Freebuff',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Do I lose tab-completion?',
          a: 'Not if you keep Cursor or use VS Code with a free completion extension. Freebuff focuses on the agent loop; pair it with whatever completion you like.',
        },
        {
          q: 'Will my Cursor rules and prompts transfer?',
          a: 'Mostly yes. Move `.cursorrules` content into `.freebuff/AGENTS.md` and Freebuff will respect it automatically.',
        },
      ],
    },
  ],
}
