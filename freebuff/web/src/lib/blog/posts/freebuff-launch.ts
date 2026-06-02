import type { Post } from '../types'

export const post: Post = {
  slug: 'freebuff-launch',
  title: 'Introducing Freebuff: the free coding agent',
  subtitle: 'No subscription. No configuration. Start in seconds.',
  description:
    'Freebuff is a free CLI coding agent with frontier models, 9 specialized subagents, and zero setup. Install with one command and start shipping.',
  category: 'Launches',
  publishedAt: '2026-02-12',
  readingMinutes: 6,
  authorId: 'james-grugett',
  featured: true,
  keywords: [
    'freebuff',
    'free coding agent',
    'free CLI coding agent',
    'free AI coding assistant',
    'free claude code alternative',
    'free codex alternative',
    'free cursor alternative',
    'codebuff',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is a free, no-config CLI coding agent — install with `npm install -g freebuff`.',
        'It uses frontier models (DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7) plus Gemini 3.1 Flash Lite for file finding.',
        '9 specialized subagents ship in the box: code-reviewer, browser-use, file-picker, thinker-gpt, and more.',
        'It is the free alternative to Claude Code, Codex CLI, Cursor, Windsurf, and Devin.',
        'Limited mode means it works in every country on Earth, even behind a VPN.',
      ],
    },
    {
      type: 'lede',
      text: "I want to write the kind of launch post I'd actually want to read, which means no flexing and no buzzwords. So here's the simple version: Freebuff is a free CLI coding agent. Install it, point it at your repo, ship code. There's no trial, no card on file, no credit cap that turns into a paywall after one big task. It's free because it should be.",
    },
    {
      type: 'p',
      text: "We started building this because the price of frontier models dropped about 10x in the last 18 months, and the price of paid coding tools didn't really move. That felt off. So we built the thing we thought should exist \u2014 a free agent that picks the right open-weight model for the job and gets out of your way. If you're not sold yet, the rest of this post is the longer version. If you are sold, scroll to the install command at the bottom.",
    },
    { type: 'h2', text: 'What you get on day one' },
    {
      type: 'ul',
      items: [
        '**One command to install.** `npm install -g freebuff` and you are agentic.',
        '**Your choice of frontier model.** DeepSeek V4 Pro for raw intelligence, Kimi K2.6 for balance, MiniMax M2.7 for speed, or DeepSeek V4 Flash if you care about efficiency.',
        '**9 specialized subagents.** Code review, browser automation, deep thinking with your own ChatGPT subscription, file finding, and more — orchestrated automatically.',
        '**Polished slash commands.** `/interview` → `/plan` → implement → `/review` takes you from a vague idea to a polished PR.',
        '**Follow-up suggestions.** After every response, Freebuff proposes three clickable next steps so the chat never dead-ends.',
      ],
    },
    { type: 'h2', text: 'How can it actually be free?' },
    {
      type: 'p',
      text: "Short answer: ads in the terminal. Slightly longer answer: small, text-only ads from sponsors developers actually use (cloud, hosting, dev infra). They show up between agent turns, never inside your code, never as popups, and never with a tracking pixel anywhere near your repo. We're not trying to clever-our-way into a $200/mo upsell. The ads pay the bills and that's the whole model.",
    },
    {
      type: 'p',
      text: "If you genuinely never want to see an ad and you're an organization that can pay, Codebuff Pro exists and that's the upgrade path. But for the 95% of folks who just want to ship, Freebuff is the answer.",
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Your code is never used for training',
      text: 'We do not store your codebase. We only collect minimal logs for debugging. If you opt into a model labeled "Collects data for training" (DeepSeek family), only the prompts you send to that model are subject to that provider\'s policy. Switch models any time with `/model`.',
    },
    { type: 'h2', text: 'How it compares' },
    {
      type: 'compare',
      competitor: 'Claude Code',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$20/mo (Pro) or $200/mo (Max)' },
        { feature: 'Models', freebuff: 'DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7', competitor: 'Claude only' },
        { feature: 'Subagents', freebuff: '9 specialized', competitor: 'Generic' },
        { feature: 'Browser use', freebuff: 'Built-in', competitor: 'MCP setup required' },
        { feature: 'Bring your own ChatGPT', freebuff: 'Yes (GPT-5.4 for deep thinking)', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'Limited mode for the rest of the world' },
    {
      type: 'p',
      text: 'Full-model Freebuff is available in 25+ countries today. Outside those countries — or when you are using a VPN — Freebuff drops to limited mode: DeepSeek V4 Flash only, 5 one-hour sessions per day. Still free. Still better than nothing. We are expanding the full-mode list every month.',
    },
    { type: 'h2', text: 'What\u2019s next' },
    {
      type: 'p',
      text: 'Freebuff Web is now in open beta — the free way to generate, edit, and deploy full-stack apps from a single prompt. Think of it as the free alternative to Lovable, Bolt, Replit Agent, and Emergent, all in one tab. Read more in the Freebuff Web launch post.',
    },
    {
      type: 'cta',
      title: 'Try Freebuff in 10 seconds',
      description: 'No account. No credit card. No config file.',
      href: '/',
      label: 'Get the install command',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is Freebuff really free forever?',
          a: 'Yes. Freebuff is ad-supported in the CLI. You will never be asked for a credit card to use the core product.',
        },
        {
          q: 'How is Freebuff different from Codebuff?',
          a: 'Freebuff is the free, ad-supported tier built on top of the Codebuff agent framework. Codebuff Pro is for teams that want priority models, longer context, and no ads.',
        },
        {
          q: 'Does Freebuff work with my existing repo?',
          a: 'Yes — just `cd` into your project and run `freebuff`. It indexes the repo on first run and keeps the index warm afterwards.',
        },
      ],
    },
  ],
}
