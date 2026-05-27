import type { Post } from '../types'

export const post: Post = {
  slug: 'byok-chatgpt-with-freebuff',
  title: 'Use ChatGPT (GPT-5.4) inside Freebuff with BYOK',
  subtitle: 'Bring your own ChatGPT key for free, deeper reasoning passes.',
  description:
    'How to use ChatGPT (GPT-5.4 and reasoning models) inside Freebuff with your own OpenAI API key. Free agent loop + your own ChatGPT-quality reasoning, side by side.',
  category: 'Guides',
  publishedAt: '2026-05-12',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'byok chatgpt',
    'chatgpt inside freebuff',
    'gpt-5 cli agent',
    'free chatgpt coding agent',
    'openai key with freebuff',
    'free codex alternative',
    'free claude code',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff supports BYOK for OpenAI — use your ChatGPT account\u2019s API key.',
        'The agent loop stays free; only token usage on your key counts.',
        'Best fit: deep architecture passes, hard debugging, security review.',
      ],
    },
    { type: 'h2', text: 'When to BYOK ChatGPT' },
    {
      type: 'ul',
      items: [
        '**Hard architecture decisions** where you want GPT-5.4 Pro\u2019s extended reasoning.',
        '**Security review** of authentication or crypto code.',
        '**Cross-paradigm refactors** (e.g., callbacks → async/await across 40 files).',
        '**Final pass before a critical PR.**',
      ],
    },
    { type: 'h2', text: 'Setup (90 seconds)' },
    {
      type: 'code',
      lang: 'bash',
      code: '# 1. Get a key at platform.openai.com\nexport OPENAI_API_KEY=sk-...\n\n# 2. Start Freebuff\nfreebuff\n\n# 3. Switch to GPT-5.4 in-session\n/model gpt-5.4-medium',
    },
    {
      type: 'p',
      text: 'Freebuff keeps the agent loop, tool calls, and subagent orchestration free. You\u2019re only paying OpenAI for the tokens the planner consumes.',
    },
    { type: 'h2', text: 'Best workflow: free model for execution, BYOK for planning' },
    {
      type: 'compare',
      competitor: 'BYOK-only setups (OpenCode, Aider)',
      rows: [
        { feature: 'Agent loop cost', freebuff: 'Free', competitor: 'Paid (per call)' },
        { feature: 'Plan with GPT-5.4', freebuff: '$0.40 \u2013 $1.50 / hour active', competitor: 'Same' },
        { feature: 'Execute with free models', freebuff: 'Yes \u2014 DeepSeek V4 Pro free', competitor: 'No' },
        { feature: 'Browser-use included', freebuff: 'Yes', competitor: 'No' },
        { feature: 'Subagents', freebuff: '9 specialized', competitor: '1' },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'Hybrid pattern',
      text: 'Use `/model gpt-5.4-medium` for the planner subagent, then switch back to the free DeepSeek V4 Pro for the editor subagent. Same effect as Codex CLI at a fraction of the cost.',
    },
    {
      type: 'cta',
      title: 'Get ChatGPT in your CLI for free',
      description: 'Install Freebuff and bring your existing OpenAI key.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
