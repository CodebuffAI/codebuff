import type { Post } from '../types'

export const post: Post = {
  slug: 'free-pi-coding-agent-cli-alternative-freebuff',
  title: 'The free alternative to Pi Coding Agent',
  subtitle: 'Same CLI agent loop — without the ~$20/mo in API tokens (BYOK) bill.',
  description:
    'Freebuff is the free alternative to Pi Coding Agent. CLI coding agent with subagents, slash commands, and included models — $0/month.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'freebuff-team',
keywords: [
    'free pi coding agent',
    'pi cli coding agent',
    'pi-coding-agent alternative',
    'pi-mono cli free',
    'pi harness coding agent',
    'pi agent vs claude code',
    'pi coding agent vs freebuff',
    'mario zechner pi agent',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is a free alternative to Pi Coding Agent — same terminal agent loop.',
        'Pi Coding Agent typical cost: ~$20/mo in API tokens (BYOK). Freebuff CLI is $0.',
        '9 subagents, slash commands, and frontier models included — no API key required to start.',
        'Runs in any editor terminal: VS Code, JetBrains, Vim, Cursor, or bare shell.',
      ],
    },
    {
      type: 'lede',
      text: 'Pi is a minimal, hackable terminal coding agent by Mario Zechner — four core tools (Read, Write, Edit, Bash), 15+ model providers, and a tree-structured session you can branch and rewind. Freebuff does the same job with models and subagents bundled in — no subscription or per-token meter on day one.',
    },
    { type: 'h2', text: 'What Pi Coding Agent costs in 2026' },
    {
      type: 'p',
      text: 'Pi itself is free and open-source (pi-mono / pi-coding-agent on npm). You pay your model provider per token — many developers report **$10–$30/mo** in API costs for daily use, or use `/login` with an existing Claude Pro, ChatGPT Plus, or GitHub Copilot subscription.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff CLI vs Pi Coding Agent' },
    {
      type: 'compare',
      competitor: 'Pi Coding Agent',
      rows: [
        { feature: 'Price', freebuff: 'Free (models included)', competitor: 'Free agent; ~$20/mo API typical' },
        { feature: 'Model bundle', freebuff: 'DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7 included', competitor: 'BYOK or /login subscriptions' },
        { feature: 'Subagents', freebuff: '9 specialized, shipped', competitor: 'Via extensions only' },
        { feature: 'Browser-use', freebuff: 'Built-in subagent', competitor: 'Via extension' },
        { feature: 'Slash commands', freebuff: '/plan, /review, /pr, /deploy, more', competitor: 'Minimal defaults' },
        { feature: 'Connect ChatGPT', freebuff: 'Yes (GPT-5.4)', competitor: 'Via OpenAI API or Plus login' },
      ],
    },
    { type: 'h2', text: 'When Pi Coding Agent is still the better pick' },
    {
      type: 'p',
      text: 'Pi wins if you want a tiny transparent agent loop you extend yourself with TypeScript skills — and you are happy bringing your own keys or subscriptions.',
    },
    { type: 'h2', text: 'How to switch from Pi Coding Agent to Freebuff' },
    {
      type: 'ol',
      items: [
        'Pi works on any repo. `cd` into your project and run `freebuff` in the same terminal — no export step.',
        'Run `npm i -g freebuff` (or use the install script from freebuff.com/cli).',
        'In your repo: `freebuff` — same terminal workflow, $0/month.',
        'Optional: connect ChatGPT for GPT-5.4 on the hardest turns.',
      ],
    },
    {
      type: 'cta',
      title: 'Try the free alternative to Pi Coding Agent',
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
          q: 'How much does Pi Coding Agent cost per year?',
          a: 'At ~$20/mo in API tokens (BYOK), expect roughly $240/year before overages. Freebuff is $0.',
        },
      ],
    },
  ],
}
