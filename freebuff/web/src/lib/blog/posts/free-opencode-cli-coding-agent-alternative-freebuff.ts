import type { Post } from '../types'

export const post: Post = {
  slug: 'free-opencode-cli-coding-agent-alternative-freebuff',
  title: 'The free alternative to OpenCode',
  subtitle: 'Open-source CLI agent + your own API keys vs $0, batteries-included.',
  description:
    'Freebuff vs OpenCode: a free, batteries-included CLI coding agent vs the BYOK open-source option. Models, subagents, browser-use, and zero spend on day one.',
  category: 'Comparisons',
  publishedAt: '2026-05-11',
  updatedAt: '2026-06-08',
  readingMinutes: 7,
  authorId: 'james-grugett',
  keywords: [
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
        'OpenCode is a great open-source CLI agent, but you bring (and pay for) the model API keys.',
        'Freebuff bundles frontier models in the free tier — Deepseek v4, Kimi K2.6, GLM 5.2, Minimax M3, plus GPT-5.4 through a connected ChatGPT subscription.',
        '9 specialized subagents ship in the box; OpenCode is one general agent.',
        'Browser-use is built in on Freebuff; OpenCode needs MCP + extra setup.',
        'If you already self-host Ollama + open weights, OpenCode is the closer fit. Otherwise Freebuff is faster to value.',
      ],
    },
    {
      type: 'lede',
      text: 'OpenCode proved that the Claude-Code-style loop could be open-sourced. Freebuff makes the same loop free to run — no API key on file, no monthly bill.',
    },
    { type: 'h2', text: 'What OpenCode costs in 2026' },
    {
      type: 'p',
      text: 'OpenCode is **free software** (SST / opencode). Your real bill is model APIs — most developers spend **$20–$50/mo** on Anthropic, OpenAI, or OpenRouter tokens, or run Ollama locally for $0 inference.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff vs OpenCode' },
    {
      type: 'compare',
      competitor: 'OpenCode',
      rows: [
        { feature: 'Per-run cost', freebuff: 'Free', competitor: 'Pay your model provider per token' },
        { feature: 'Model bundle', freebuff: 'Deepseek v4, Kimi K2.6, GLM 5.2, Minimax M3 included + BYOK for Claude Code & Codex', competitor: 'BYOK — OpenAI, Anthropic, OpenRouter, Ollama' },
        { feature: 'Connect ChatGPT subscription', freebuff: 'Yes', competitor: 'Not applicable; OpenCode uses API keys' },
        { feature: 'Subagents bundled', freebuff: '9 specialized', competitor: '1 general agent' },
        { feature: 'Browser-use', freebuff: 'Built-in', competitor: 'MCP + setup' },
        { feature: 'Slash commands shipped', freebuff: '/interview, /plan, /review, /pr, /deploy, more', competitor: 'Minimal default set' },
        { feature: 'Codebase indexing', freebuff: 'Local + free', competitor: 'Local, you handle embeddings' },
        { feature: 'License', freebuff: 'Free (ad-supported, source available)', competitor: 'MIT / Apache (depends on fork)' },
      ],
    },
    { type: 'h2', text: 'When OpenCode is the better pick' },
    {
      type: 'ul',
      items: [
        '**You self-host open-weight models** (Ollama, vLLM) and want zero data leaving your network.',
        '**You want to audit and fork every line** of the agent loop.',
        '**Air-gapped environments** where Freebuff\u2019s ad endpoint can\u2019t resolve.',
      ],
    },
    { type: 'h2', text: 'When Freebuff is the better pick' },
    {
      type: 'ul',
      items: [
        '**You don\u2019t want to manage API keys** for 3+ providers.',
        '**You want browser verification, code review, and deep thinking built in** without wiring MCP servers.',
        '**Your model bill matters** — Freebuff\u2019s included models cover most coding tasks at $0 per run.',
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'You can pair them',
      text: 'Some teams use OpenCode for local-only refactors against an Ollama Qwen model, and Freebuff for any task that benefits from a frontier model or browser verification. Both write to the same repo; pick per task.',
    },
    {
      type: 'cta',
      title: 'Get the batteries-included free option',
      description: 'Install Freebuff with one npm command — no API keys to set up.',
      href: '/',
      label: 'Install Freebuff',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is OpenCode actually free?',
          a: 'OpenCode\u2019s code is free and open-source. Running it is not — you pay your model provider per token (OpenAI, Anthropic, OpenRouter, or your own compute for Ollama).',
        },
        {
          q: 'Can Freebuff use the same models OpenCode uses?',
          a: 'Freebuff supports BYOK for Claude Code and Codex, plus ChatGPT OAuth for Codex. It also includes all top Chinese frontier models (Deepseek v4, Kimi K2.6, GLM 5.2, Minimax M3) and can use GPT-5.4 through a connected ChatGPT subscription.',
        },
      ],
    },
  ],
}
