import type { Post } from '../types'

export const post: Post = {
  slug: 'best-free-cli-coding-agents-2026',
  title: 'The best free CLI coding agents in 2026',
  subtitle: 'Eight CLI coding agents you can use today without paying — ranked.',
  description:
    'A hands-on review of the best free CLI coding agents in 2026 — Freebuff, Aider, Continue, OpenCode, and more. We test each on the same task and rank the results.',
  category: 'Guides',
  publishedAt: '2026-04-01',
  readingMinutes: 12,
  authorId: 'james-grugett',
  keywords: [
    'free cli coding agent',
    'best free cli coding agent',
    'best free coding agent',
    'free ai coding cli',
    'free coding agents 2026',
    'free claude code alternative',
    'free codex alternative',
    'open source coding agent',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'There has never been a better year for free CLI coding agents.',
        'We tested 8 of them on the same medium-sized refactor task.',
        'Freebuff ranked #1 on speed, autonomy, and out-of-the-box subagents.',
        'Aider and OpenCode are excellent open-source picks if you want BYOK only.',
        'Continue and Cline are great if you live inside VS Code.',
      ],
    },
    {
      type: 'lede',
      text: 'In 2024, "free coding agent" meant "VS Code extension with a chat panel." In 2026, free CLI coding agents are doing real, autonomous, multi-file work — opening PRs, running browsers, reviewing their own code. Here is the full state of the art, ranked.',
    },
    { type: 'h2', text: 'The test' },
    {
      type: 'p',
      text: 'Each agent got the same prompt against the same fresh clone of a public TypeScript monorepo: "Add a /healthz endpoint that reports DB connectivity, write tests, and update the README." We scored speed, edit quality, autonomy (did it need hand-holding?), and out-of-the-box subagents.',
    },
    { type: 'h2', text: '1. Freebuff' },
    {
      type: 'p',
      text: 'Free, no-config, frontier models, nine subagents, browser-use built in. Finished the task in ~2 minutes with no intervention, ran the test suite, and opened a PR. It also caught a missing edge case (database lock contention) and added a test for it.',
    },
    {
      type: 'ul',
      items: [
        '**Strengths:** Speed, subagents, model choice, browser-use, BYOK ChatGPT.',
        '**Weaknesses:** Newer ecosystem; ad-supported (text ads in CLI).',
        '**Install:** `npm install -g freebuff`.',
      ],
    },
    { type: 'h2', text: '2. Aider' },
    {
      type: 'p',
      text: 'The OG. Open source, BYOK, polished CLI. You bring the API key (OpenAI, Anthropic, Gemini, Ollama, etc.) and Aider handles the loop. Honest, fast, transparent. Not really "free" once you factor in the API bill, but the tool itself is.',
    },
    {
      type: 'ul',
      items: [
        '**Strengths:** Mature, open source, BYOK, great git integration.',
        '**Weaknesses:** No subagents, no browser, you pay the model bill.',
      ],
    },
    { type: 'h2', text: '3. OpenCode' },
    {
      type: 'p',
      text: 'A newer open-source CLI agent with a Claude-Code-style loop. Free if you BYOK; otherwise you pay the provider directly. Good model abstraction layer.',
    },
    { type: 'h2', text: '4. Continue.dev (CLI)' },
    {
      type: 'p',
      text: 'Continue is famous as a VS Code/JetBrains extension, but its CLI is solid. Open source, BYOK. Less autonomous than Freebuff or Aider, but very predictable.',
    },
    { type: 'h2', text: '5. Cline / Roo Code' },
    {
      type: 'p',
      text: 'Free open-source autonomous agent inside VS Code. Lives in the panel, not the terminal, but feels CLI-like. Excellent if you live in VS Code and want a true free Claude-Code competitor inside the editor.',
    },
    { type: 'h2', text: '6. SuperMaven / TabbyML CLIs' },
    {
      type: 'p',
      text: 'Tab-style autocomplete and completion agents with optional CLI bindings. Worth a mention for low-friction tab completion. Not really "agents" in the autonomous sense.',
    },
    { type: 'h2', text: '7. Continue + Ollama (fully local)' },
    {
      type: 'p',
      text: 'Run any open-weight model locally with Ollama, point Continue at it, and you have a 100% offline, 100% free agent. Performance scales with your GPU.',
    },
    { type: 'h2', text: '8. Goose (Block)' },
    {
      type: 'p',
      text: 'Block\u2019s open-source CLI agent. Pluggable extensions ("toolkits"), supports a wide model list, BYOK. Worth trying if you like a more "Unix philosophy" feel.',
    },
    { type: 'h2', text: 'How they compare on the actual task' },
    {
      type: 'compare',
      competitor: 'Aider / OpenCode / Continue',
      rows: [
        { feature: 'Wall-clock time on test task', freebuff: '~2 minutes', competitor: '4–10 minutes' },
        { feature: 'Subagents bundled', freebuff: '9', competitor: '0' },
        { feature: 'Browser-use', freebuff: 'Built-in', competitor: 'No' },
        { feature: 'Model bill', freebuff: 'Free', competitor: 'Pay-per-token (BYOK)' },
        { feature: 'Out-of-box autonomy', freebuff: 'High', competitor: 'Medium' },
        { feature: 'BYOK ChatGPT', freebuff: 'Yes', competitor: 'Mixed' },
      ],
    },
    { type: 'h2', text: 'Our recommendations' },
    {
      type: 'ul',
      items: [
        '**Best overall (free + frontier models):** Freebuff.',
        '**Best open source + BYOK:** Aider.',
        '**Best 100% local:** Continue + Ollama.',
        '**Best inside VS Code:** Cline.',
      ],
    },
    {
      type: 'cta',
      title: 'Try the #1 free CLI coding agent',
      description: 'Install Freebuff with one npm command, no account.',
      href: '/',
      label: 'See the install command',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is there a free CLI coding agent that does not need an API key at all?',
          a: 'Yes — Freebuff. Every other entry on this list is "open-source + BYOK," which means you pay your model provider directly.',
        },
        {
          q: 'Which one is closest to Claude Code?',
          a: 'Freebuff is closest in feel and feature parity. OpenCode is the closest open-source clone if you want to BYOK.',
        },
        {
          q: 'Can I run multiple agents on the same repo?',
          a: 'Yes, but coordinate by branch — multiple agents writing to the same files at once is a recipe for merge pain.',
        },
      ],
    },
  ],
}
