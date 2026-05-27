import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-codex',
  title: 'The free alternative to OpenAI Codex (and the Codex CLI)',
  subtitle: 'A free CLI coding agent that runs your code, edits your repo, and ships PRs.',
  description:
    'Freebuff is a free alternative to OpenAI Codex and the Codex CLI. Get a CLI coding agent with subagents and model choice, with no ChatGPT Plus required.',
  category: 'Comparisons',
  publishedAt: '2026-03-25',
  readingMinutes: 7,
  authorId: 'james-grugett',
  keywords: [
    'free codex',
    'free codex cli',
    'free openai codex',
    'codex free',
    'codex alternative',
    'free codex alternative',
    'codex vs freebuff',
    'free chatgpt coding agent',
    'codex cli alternative',
    'gpt-5 codex free',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is the free alternative to OpenAI Codex and the Codex CLI.',
        'Codex requires ChatGPT Plus ($20/mo) or higher to run the cloud agent.',
        'Freebuff runs locally, ships with 9 subagents, and lets you BYOK ChatGPT to layer GPT-5.4 in for free.',
        'Same shape: read repo, plan, edit, run, verify, PR.',
      ],
    },
    {
      type: 'lede',
      text: 'OpenAI Codex is brilliant. It is also gated behind a ChatGPT Plus subscription, with cloud-only execution and limited control over which model handles each turn. Freebuff is the same loop, free, local, and model-agnostic.',
    },
    { type: 'h2', text: 'What "free version of Codex" actually looks like' },
    {
      type: 'p',
      text: 'Codex (the cloud agent and the Codex CLI) is OpenAI\u2019s answer to autonomous coding: hand it a repo and a task, and it plans, edits, runs the test suite, and opens a PR. Freebuff does that locally on your machine instead of in OpenAI\u2019s cloud, so your codebase never leaves your laptop, and the per-task cost is zero.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff vs Codex' },
    {
      type: 'compare',
      competitor: 'OpenAI Codex',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'ChatGPT Plus ($20+/mo) required' },
        { feature: 'Execution location', freebuff: 'Local — your machine, your filesystem', competitor: 'OpenAI cloud sandbox' },
        { feature: 'Model choice', freebuff: 'DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7, GPT-5.4 (BYOK)', competitor: 'GPT-5.x family only' },
        { feature: 'Subagents', freebuff: '9 specialized', competitor: 'General agent only' },
        { feature: 'Bring-your-own ChatGPT', freebuff: 'Yes', competitor: 'You are already paying' },
        { feature: 'Browser-use subagent', freebuff: 'Built-in', competitor: 'Limited' },
        { feature: 'Run on a private repo', freebuff: 'No upload required', competitor: 'Cloud sandbox uploads' },
      ],
    },
    { type: 'h2', text: 'When Codex is still the better pick' },
    {
      type: 'ul',
      items: [
        '**You want pure cloud execution.** Codex spins up sandboxes; nothing to install. Freebuff runs locally.',
        '**You want OpenAI\u2019s exact agent loop and prompt taste.** Freebuff has its own opinions.',
      ],
    },
    { type: 'h2', text: 'When Freebuff is the better pick' },
    {
      type: 'ul',
      items: [
        '**You do not want to upload your codebase.** Freebuff is local-first.',
        '**You want to pick the cheapest or fastest model per task.** `/model` switches mid-conversation.',
        '**You already have a ChatGPT subscription.** Connect it and unlock GPT-5.4 inside Freebuff, free.',
        '**You want subagents that specialize.** Browser-use, code-reviewer, file-picker, thinker-gpt are all included.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'BYOK ChatGPT is the trick',
      text: 'If you already pay for ChatGPT Plus, Freebuff lets you use that subscription to power its deep-thinking subagent with GPT-5.4. Same model Codex uses, but routed through your own subscription — free inside Freebuff.',
    },
    { type: 'h2', text: 'Migrating from Codex CLI' },
    {
      type: 'ol',
      items: [
        'Install: `npm install -g freebuff`.',
        '`cd` into the repo Codex was working on.',
        'Run `freebuff` and `/connect-chatgpt` to layer GPT-5.4 in for deep thinking.',
        'Hand it the same prompt you would give Codex. The shape of the loop is the same.',
      ],
    },
    {
      type: 'cta',
      title: 'Get the free alternative to OpenAI Codex',
      description: 'No ChatGPT Plus required. Runs locally on your machine.',
      href: '/',
      label: 'See the install command',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Does Freebuff use GPT-5?',
          a: 'Yes, via BYOK. Connect your ChatGPT subscription with `/connect-chatgpt` and Freebuff routes its deep-thinking subagent through GPT-5.4 on your account.',
        },
        {
          q: 'Will Freebuff open a PR for me like Codex?',
          a: 'Yes. Run `/pr` and the agent will create a branch, write a commit message, push, and open a pull request with a summary.',
        },
        {
          q: 'Can I run Freebuff in CI like Codex?',
          a: 'Yes. The `freebuff` CLI accepts non-interactive prompts and is safe to call from GitHub Actions. The Codebuff SDK gives you a programmatic interface.',
        },
      ],
    },
  ],
}
