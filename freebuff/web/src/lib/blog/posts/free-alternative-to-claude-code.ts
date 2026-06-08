import type { Post } from '../types'

export const post: Post = {
  slug: 'free-alternative-to-claude-code',
  title: 'The free alternative to Claude Code',
  subtitle: 'Same CLI agent loop. Different bill.',
  description:
    'Freebuff is a free alternative to Claude Code — a CLI coding agent with subagents, slash commands, and frontier models. No Claude Pro or Max subscription required.',
  category: 'Comparisons',
  publishedAt: '2026-03-17',
  updatedAt: '2026-06-08',
  readingMinutes: 8,
  authorId: 'james-grugett',
  featured: true,
  keywords: [
    'free claude code',
    'free claude code alternative',
    'claude code free',
    'claude code alternative',
    'free anthropic cli',
    'claude code vs freebuff',
    'free cli coding agent',
    'free claude code cli',
    'open source claude code',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is a free alternative to Claude Code with the same CLI-first agent loop.',
        'Claude Code Pro is $20/mo, Max is $200/mo. Freebuff is $0.',
        'You get 9 specialized subagents in the box: code-reviewer, browser-use, file-picker, and more.',
        'Frontier model options (DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7) plus GPT-5.4 through a connected ChatGPT subscription.',
        'Connect your ChatGPT subscription to layer in GPT-5.4 deep thinking.',
      ],
    },
    {
      type: 'lede',
      text: "Claude Code is, in my opinion, the best-designed CLI agent of the last two years. The taste is real. The feedback loop is right. I tell every new engineer to go read its docs even if they never plan to use it. The only thing standing between most people and shipping with it is the bill \u2014 $20/mo for Pro, $200/mo for Max. So the question keeps coming up: is there a free version that's actually good? Freebuff is our answer.",
    },
    { type: 'h2', text: "What \u201Cfree Claude Code\u201D actually means here" },
    {
      type: 'p',
      text: "Freebuff is a CLI-first agent. You install it once with npm, `cd` into a repo, run `freebuff`, and you're talking to an agent that can plan, edit files, run shell commands, and review its own output. Same shape as `claude`. Different model menu, a richer subagent ecosystem in the box, and \u2014 the headline \u2014 nothing on your card. We genuinely think it's the closest 1:1 experience you can get to Claude Code for $0.",
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff vs Claude Code' },
    {
      type: 'compare',
      competitor: 'Claude Code',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$20/mo (Pro), $200/mo (Max)' },
        { feature: 'Primary model', freebuff: 'DeepSeek V4 Pro / Kimi K2.6 / MiniMax M2.7', competitor: 'Claude 4.x family' },
        { feature: 'Model choice per task', freebuff: 'Yes via `/model`', competitor: 'Limited' },
        { feature: 'Subagents bundled', freebuff: '9 specialized', competitor: 'Generic delegation' },
        { feature: 'Browser-use subagent', freebuff: 'Built-in', competitor: 'MCP setup required' },
        { feature: 'Deep thinking with GPT-5.4', freebuff: 'Connected ChatGPT subscription', competitor: 'Not available' },
        { feature: 'Slash command palette', freebuff: '/interview, /plan, /review, /deploy, more', competitor: 'Smaller default set' },
        { feature: 'Available globally', freebuff: 'Yes (limited mode covers VPNs + other countries)', competitor: 'Region-restricted' },
      ],
    },
    { type: 'h2', text: 'What you keep' },
    {
      type: 'ul',
      items: [
        '**The CLI feel.** A real terminal interface, not a chat panel in an editor.',
        '**Long-running tasks.** Plan, edit, run, test, fix — the agent stays autonomous until the task is done.',
        '**Permission prompts before destructive shell commands.** Approve only what you want.',
        '**Subagent delegation.** Big tasks fan out to focused workers (file-picker, code-reviewer, browser-use) and come back with verified results.',
      ],
    },
    { type: 'h2', text: 'What you get that Claude Code does not have' },
    {
      type: 'ul',
      items: [
        '**Choice of frontier model.** Switch models mid-conversation. Each task can use the model best suited to it.',
        '**Built-in browser-use subagent.** The agent can drive a real browser to verify the app it just shipped.',
        '**Connected ChatGPT.** Layer GPT-5.4 on top for the deepest reasoning.',
        '**Slash commands shaped around shipping.** `/interview` flushes out requirements, `/plan` produces a written spec, `/review` runs the code-reviewer subagent.',
        '**Free.** The big one.',
      ],
    },
    { type: 'h2', text: 'When Claude Code is still the better pick' },
    {
      type: 'p',
      text: 'If your team is standardized on Anthropic models, has bought into the Claude Sonnet/Opus style of reasoning, and the $20–$200/mo is rounding error, Claude Code is a fantastic product. Freebuff is for everyone else: people who want the same loop without the subscription, or want to choose their model per task.',
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'You can run both',
      text: 'Plenty of devs alternate. They keep Claude Code for Anthropic-flavored reasoning and use Freebuff for fast iteration, browser tasks, and any model that is not Claude.',
    },
    { type: 'h2', text: 'Migrating from Claude Code' },
    {
      type: 'ol',
      items: [
        'Install: `npm install -g freebuff`.',
        '`cd` into your repo and run `freebuff` — your shell history is preserved across sessions.',
        'Run `/connect-chatgpt` if you want GPT-5.4 for deep thinking.',
        'Try `/interview` on any new feature to feel the difference vs Claude Code\u2019s default loop.',
      ],
    },
    {
      type: 'cta',
      title: 'Get the free alternative to Claude Code',
      description: 'One npm command, no credit card.',
      href: '/',
      label: 'See the install command',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Can Freebuff use Claude under the hood?',
          a: 'Not directly today — Freebuff defaults to DeepSeek, Kimi, MiniMax, and Gemini. You can connect ChatGPT to layer in GPT-5.4.',
        },
        {
          q: 'Will the quality match Claude Code?',
          a: 'For typical agentic coding (read, plan, edit, run tests), DeepSeek V4 Pro and Kimi K2.6 are at parity with Claude on most benchmarks. For the hardest reasoning, connected GPT-5.4 closes the gap.',
        },
        {
          q: 'How does the ad-supported model work?',
          a: 'Freebuff shows occasional text ads in the CLI from developer-tool sponsors. No popups, no tracking pixels, no telemetry attached to your code.',
        },
      ],
    },
  ],
}
