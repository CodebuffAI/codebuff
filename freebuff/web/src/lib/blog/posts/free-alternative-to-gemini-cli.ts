import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-gemini-cli',
  title: 'The free alternative to Gemini CLI',
  subtitle: 'A free CLI agent that doesn\u2019t make you bring a Gemini key — and lets you pick the model per task.',
  description:
    'Freebuff is a free alternative to Google\u2019s Gemini CLI. Use a real CLI coding agent with frontier models, 9 subagents, and zero API setup. No Google account required.',
  category: 'Comparisons',
  publishedAt: '2026-05-14',
  updatedAt: '2026-06-08',
  readingMinutes: 6,
  authorId: 'freebuff-team',
  keywords: [
    'free gemini cli',
    'gemini cli alternative',
    'google gemini cli free',
    'gemini cli vs freebuff',
    'free google ai coding',
    'free claude code',
    'free codex',
    'free cli coding agent',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Gemini CLI is great, free during preview, and locked to one model family — Google Gemini.',
        'Freebuff is also free, supports many models (Deepseek v4, Kimi K2.6, GLM 5.2, Minimax M3, and GPT-5.4 through a connected ChatGPT subscription), and ships 9 specialized subagents.',
        'Gemini CLI requires a Google Cloud / Gemini API key. Freebuff requires nothing.',
        'Both run locally and edit files in your terminal.',
      ],
    },
    {
      type: 'lede',
      text: 'Google\u2019s Gemini CLI is a polished free preview of "what if Google had Claude Code?" Freebuff is a free CLI agent that doesn\u2019t make you pick one vendor\u2019s model.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff vs Gemini CLI' },
    {
      type: 'compare',
      competitor: 'Gemini CLI',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: 'Free during preview; rate-limited' },
        { feature: 'API key required', freebuff: 'No', competitor: 'Yes — Gemini API key' },
        { feature: 'Models', freebuff: 'Deepseek v4, Kimi K2.6, GLM 5.2, Minimax M3, GPT-5.4 (connected ChatGPT)', competitor: 'Gemini 3.x family only' },
        { feature: 'Choose model per task', freebuff: '`/model` switch', competitor: 'Locked' },
        { feature: 'Subagents', freebuff: '9 specialized', competitor: 'General agent' },
        { feature: 'Browser-use', freebuff: 'Built-in', competitor: 'No native support' },
        { feature: 'Connect ChatGPT subscription', freebuff: 'Yes', competitor: 'No (Google account only)' },
        { feature: 'Codebase indexing', freebuff: 'Local + free', competitor: 'Local + free' },
      ],
    },
    { type: 'h2', text: 'When Gemini CLI wins' },
    {
      type: 'ul',
      items: [
        '**You love Gemini\u2019s style** — long-context summarization is excellent.',
        '**You\u2019re already inside Google Cloud** and want the path of least friction.',
        '**You want huge free quotas during preview** — Google\u2019s preview limits are generous right now.',
      ],
    },
    { type: 'h2', text: 'When Freebuff wins' },
    {
      type: 'ul',
      items: [
        '**You don\u2019t want a Google account on file**.',
        '**You want model choice** — sometimes Kimi is the right call, sometimes DeepSeek, sometimes connected GPT-5.4.',
        '**You want browser-use, code review, and deep-thinking subagents** in the box.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Freebuff already uses Gemini',
      text: 'Under the hood, Freebuff\u2019s file-picker subagent uses Gemini 3.1 Flash Lite for fast file finding. So you get the best of Gemini\u2019s long-context throughput inside a broader agent — no API key needed.',
    },
    {
      type: 'cta',
      title: 'Try the free alternative to Gemini CLI',
      description: 'No API key. No Google account. One npm command.',
      href: '/',
      label: 'Install Freebuff',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Will the Gemini CLI preview stay free?',
          a: 'Probably not at current quotas. Google has historically introduced paid tiers once preview tools graduate. Freebuff is free as a permanent commitment, supported by CLI ads.',
        },
        {
          q: 'Can I use Gemini models inside Freebuff?',
          a: 'Yes — Freebuff routes its file-picker through Gemini Flash Lite. Direct Gemini selection from `/model` is on the roadmap.',
        },
      ],
    },
  ],
}
