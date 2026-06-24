/**
 * Generate CLI comparison + savings posts (pi, GitHub Copilot CLI) and CLI savings stories.
 * Run after migrate-blog-seo-slugs.ts
 * Run: bun freebuff/web/scripts/generate-cli-blog-posts.ts
 */
import { writeFileSync, existsSync } from 'fs'
import { join } from 'path'

import { blogSeoEntries } from '../src/lib/blog/blog-seo-config'
import {
  comparisonKeywordsById,
  formatKeywordsArray,
  savingsKeywordsFor,
} from '../src/lib/blog/competitor-seo-keywords'

const POSTS_DIR = join(import.meta.dir, '../src/lib/blog/posts')

interface CliCompetitor {
  id: string
  displayName: string
  middleTierName: string
  middleTierMonthly: number
  priceRange: string
  pricingNote: string
  whatItDoes: string
  whenTheyWin: string
  migrationNote: string
  compareRows: Array<{ feature: string; freebuff: string; competitor: string }>
  specialNote?: string
}

const cliCompetitors: CliCompetitor[] = [
  {
    id: 'pi',
    displayName: 'Pi Coding Agent',
    middleTierName: 'typical model API spend',
    middleTierMonthly: 20,
    priceRange: '~$20/mo in API tokens (BYOK)',
    pricingNote:
      'Pi itself is free and open-source (pi-mono / pi-coding-agent on npm). You pay your model provider per token — many developers report **$10–$30/mo** in API costs for daily use, or use `/login` with an existing Claude Pro, ChatGPT Plus, or GitHub Copilot subscription.',
    whatItDoes:
      'Pi is a minimal, hackable terminal coding agent by Mario Zechner — four core tools (Read, Write, Edit, Bash), 15+ model providers, and a tree-structured session you can branch and rewind.',
    whenTheyWin:
      'Pi wins if you want a tiny transparent agent loop you extend yourself with TypeScript skills — and you are happy bringing your own keys or subscriptions.',
    migrationNote: 'Pi works on any repo. `cd` into your project and run `freebuff` in the same terminal — no export step.',
    compareRows: [
      { feature: 'Price', freebuff: 'Free (models included)', competitor: 'Free agent; ~$20/mo API typical' },
      { feature: 'Model bundle', freebuff: 'DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7 included', competitor: 'BYOK or /login subscriptions' },
      { feature: 'Subagents', freebuff: '9 specialized, shipped', competitor: 'Via extensions only' },
      { feature: 'Browser-use', freebuff: 'Built-in subagent', competitor: 'Via extension' },
      { feature: 'Slash commands', freebuff: '/plan, /review, /pr, /deploy, more', competitor: 'Minimal defaults' },
      { feature: 'Connect ChatGPT', freebuff: 'Yes (GPT-5.4)', competitor: 'Via OpenAI API or Plus login' },
    ],
  },
  {
    id: 'github-copilot-cli',
    displayName: 'GitHub Copilot CLI',
    middleTierName: 'GitHub Copilot Pro+',
    middleTierMonthly: 39,
    priceRange: '$39/mo (Copilot Pro+)',
    pricingNote:
      'GitHub Copilot CLI is included on all Copilot plans. **Copilot Pro is $10/mo**; **Copilot Pro+ is $39/mo** with a larger AI Credits pool. As of June 2026, usage is metered in GitHub AI Credits (1 credit = $0.01) per token — heavy agent sessions can burn through included credits fast (per [GitHub Copilot billing docs](https://docs.github.com/en/copilot/reference/copilot-billing/models-and-pricing)).',
    whatItDoes:
      'GitHub Copilot CLI is GitHub\'s terminal agent: plan, edit, run shell commands, and open PRs — tied to your GitHub account and Copilot subscription.',
    whenTheyWin:
      'Copilot CLI wins if your team already pays for Copilot Enterprise, needs GitHub-native PR flows, and wants usage pooled at the org level.',
    migrationNote: 'Clone your repo locally (if not already), install Freebuff with `npm i -g freebuff`, run `freebuff` in the project root.',
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$10–$39/mo + credit overages' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — AI Credits per token' },
      { feature: 'Model choice', freebuff: 'Multiple included + ChatGPT connect', competitor: 'Copilot model menu' },
      { feature: 'Subagents', freebuff: '9 specialized', competitor: 'Single agent' },
      { feature: 'Editor lock-in', freebuff: 'None — any terminal', competitor: 'None — CLI' },
      { feature: 'GitHub integration', freebuff: 'Via `gh` CLI / /pr', competitor: 'Native GitHub' },
    ],
  },
]

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
}

function comparisonPost(c: CliCompetitor, slug: string): string {
  const keywords = comparisonKeywordsById[c.id] ?? []
  const shutdown = c.specialNote
    ? `
    {
      type: 'callout',
      tone: 'warning',
      title: 'Note',
      text: '${esc(c.specialNote)}',
    },`
    : ''

  return `import type { Post } from '../types'

export const post: Post = {
  slug: '${slug}',
  title: 'The free alternative to ${esc(c.displayName)}',
  subtitle: 'Same CLI agent loop — without the ${esc(c.priceRange)} bill.',
  description:
    'Freebuff is the free alternative to ${esc(c.displayName)}. CLI coding agent with subagents, slash commands, and included models — $0/month.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'freebuff-team',
${formatKeywordsArray(keywords)}
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff is a free alternative to ${esc(c.displayName)} — same terminal agent loop.',
        '${esc(c.displayName)} typical cost: ${esc(c.priceRange)}. Freebuff CLI is $0.',
        '9 subagents, slash commands, and frontier models included — no API key required to start.',
        'Runs in any editor terminal: VS Code, JetBrains, Vim, Cursor, or bare shell.',
      ],
    },
    {
      type: 'lede',
      text: '${esc(c.whatItDoes)} Freebuff does the same job with models and subagents bundled in — no subscription or per-token meter on day one.',
    },
    { type: 'h2', text: 'What ${esc(c.displayName)} costs in 2026' },
    {
      type: 'p',
      text: '${esc(c.pricingNote)}',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff CLI vs ${esc(c.displayName)}' },
    {
      type: 'compare',
      competitor: '${esc(c.displayName)}',
      rows: [
${c.compareRows.map((r) => `        { feature: '${esc(r.feature)}', freebuff: '${esc(r.freebuff)}', competitor: '${esc(r.competitor)}' },`).join('\n')}
      ],
    },
    { type: 'h2', text: 'When ${esc(c.displayName)} is still the better pick' },
    {
      type: 'p',
      text: '${esc(c.whenTheyWin)}',
    },
    { type: 'h2', text: 'How to switch from ${esc(c.displayName)} to Freebuff' },
    {
      type: 'ol',
      items: [
        '${esc(c.migrationNote)}',
        'Run \`npm i -g freebuff\` (or use the install script from freebuff.com/cli).',
        'In your repo: \`freebuff\` — same terminal workflow, $0/month.',
        'Optional: connect ChatGPT for GPT-5.4 on the hardest turns.',
      ],
    },${shutdown}
    {
      type: 'cta',
      title: 'Try the free alternative to ${esc(c.displayName)}',
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
          q: 'How much does ${esc(c.displayName)} cost per year?',
          a: 'At ${esc(c.priceRange)}, expect roughly $${c.middleTierMonthly * 12}/year before overages. Freebuff is $0.',
        },
      ],
    },
  ],
}
`
}

function savingsPost(
  c: CliCompetitor,
  slug: string,
  comparisonSlug: string,
  annual: number,
): string {
  const keywords = savingsKeywordsFor(c.id).map((k) =>
    k.replace('freebuff', 'freebuff cli').replace('switch from', 'switch from'),
  )
  // Dedupe and add cli-specific
  const allKw = [...new Set([...keywords, `${c.id} cli savings`, 'freebuff cli alternative'])]

  return `import type { Post } from '../types'

export const post: Post = {
  slug: '${slug}',
  title: 'How one ${esc(c.displayName)} user saved $${annual} by switching to Freebuff CLI',
  subtitle: '$${c.middleTierMonthly}/mo ${esc(c.middleTierName)} → $0 with Freebuff.',
  description:
    'Savings breakdown: ${esc(c.displayName)} at ${esc(c.priceRange)} vs Freebuff CLI at $0. A modeled example for terminal-first developers.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
${formatKeywordsArray(allKw)}
  body: [
    {
      type: 'tldr',
      items: [
        '${esc(c.middleTierName)} on ${esc(c.displayName)}: about $${c.middleTierMonthly}/month ($${annual}/year).',
        'Freebuff CLI: $0/month with models and subagents included.',
        'Net savings: $${annual}/year before API or credit overages.',
        'Modeled example — your usage may differ.',
      ],
    },
    {
      type: 'lede',
      text: 'Terminal agents are where subscription and token costs add up fastest. Here is the math for ${esc(c.displayName)} vs Freebuff CLI — not a fabricated testimonial, but the switch we see often.',
    },
    { type: 'h2', text: 'The bill on ${esc(c.middleTierName)}' },
    {
      type: 'p',
      text: '${esc(c.pricingNote)} For this example: **$${c.middleTierMonthly}/month** or **$${annual}/year**.',
    },
    {
      type: 'compare',
      competitor: '${esc(c.middleTierName)}',
      rows: [
        { feature: 'Monthly cost', freebuff: '$0', competitor: '$${c.middleTierMonthly}' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$${annual}' },
        { feature: 'Token / credit overages', freebuff: 'None', competitor: 'Common on long agent sessions' },
        { feature: 'Subagents', freebuff: '9 included', competitor: 'Varies' },
        { feature: 'Model bundle', freebuff: 'Included', competitor: 'Subscription or BYOK' },
      ],
    },
    { type: 'h2', text: 'Three-step switch' },
    {
      type: 'ol',
      items: [
        '${esc(c.migrationNote)}',
        'Install Freebuff: \`npm i -g freebuff\`',
        'Cancel ${esc(c.displayName)} billing once you have verified Freebuff on your repos.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Full comparison',
      text: 'Read [The free alternative to ${esc(c.displayName)}](/blog/${comparisonSlug}) for the feature-by-feature table.',
    },
    {
      type: 'cta',
      title: 'Stop paying $${c.middleTierMonthly}/mo',
      href: '/cli',
      label: 'Install Freebuff CLI',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Can I run both Copilot CLI and Freebuff?',
          a: 'Yes. Many developers use Freebuff for heavy agent work and keep IDE completions elsewhere — or drop the paid tier entirely.',
        },
        {
          q: 'Do I need to change editors?',
          a: 'No. Freebuff runs in whatever terminal you already use.',
        },
      ],
    },
  ],
}
`
}

// CLI savings for existing agents (data only — files created by savings generator)
const cliSavingsMeta: Record<string, CliCompetitor> = {
  'claude-code': {
    id: 'claude-code',
    displayName: 'Claude Code',
    middleTierName: 'Claude Code Pro',
    middleTierMonthly: 20,
    priceRange: '$20/mo (Pro)',
    pricingNote:
      'Claude Code Pro is **$20/mo**; Max is **$200/mo**. Pro includes agent access tied to your Anthropic subscription.',
    whatItDoes: 'Anthropic\'s CLI coding agent.',
    whenTheyWin: '',
    migrationNote: 'Same repo, same terminal — run `freebuff` instead of `claude`.',
    compareRows: [],
  },
  codex: {
    id: 'codex',
    displayName: 'OpenAI Codex CLI',
    middleTierName: 'ChatGPT Plus',
    middleTierMonthly: 20,
    priceRange: '$20/mo (ChatGPT Plus)',
    pricingNote:
      'Codex and the Codex CLI require **ChatGPT Plus at $20/mo** or higher for cloud agent access.',
    whatItDoes: 'OpenAI\'s Codex CLI agent.',
    whenTheyWin: '',
    migrationNote: 'Run `freebuff` in the same repo — local-first, no Plus subscription.',
    compareRows: [],
  },
  opencode: {
    id: 'opencode',
    displayName: 'OpenCode',
    middleTierName: 'typical API spend',
    middleTierMonthly: 30,
    priceRange: '~$30/mo (model APIs)',
    pricingNote:
      'OpenCode is free software but **BYOK** — most users pay **$20–$50/mo** to model providers depending on volume.',
    whatItDoes: 'Open-source CLI agent from SST.',
    whenTheyWin: '',
    migrationNote: 'Keep your repo; swap the CLI command to `freebuff`.',
    compareRows: [],
  },
  cursor: {
    id: 'cursor',
    displayName: 'Cursor Agent',
    middleTierName: 'Cursor Pro',
    middleTierMonthly: 20,
    priceRange: '$20/mo (Pro)',
    pricingNote:
      'Cursor Pro is **$20/mo**; Ultra is **$200/mo**. The agent loop is gated behind Pro for serious use.',
    whatItDoes: 'Cursor\'s in-editor and terminal agent.',
    whenTheyWin: '',
    migrationNote: 'Keep Cursor for tab completion; run `freebuff` in the terminal panel and cancel Pro.',
    compareRows: [],
  },
  antigravity: {
    id: 'antigravity',
    displayName: 'Antigravity CLI',
    middleTierName: 'future Gemini spend',
    middleTierMonthly: 20,
    priceRange: 'Free today; Gemini API ~$20/mo typical',
    pricingNote:
      'Antigravity is **free at launch** but Gemini-powered; long-term pricing is TBD. Budget **~$20/mo** equivalent in API or future seat fees for planning.',
    whatItDoes: 'Google\'s agentic IDE with CLI surfaces.',
    whenTheyWin: '',
    migrationNote: 'Use Freebuff in your existing editor instead of switching to Antigravity\'s fork.',
    compareRows: [],
  },
}

let written = 0

for (const c of cliCompetitors) {
  const entry = blogSeoEntries.find((e) => e.id === c.id)!
  const compPath = join(POSTS_DIR, `${entry.comparisonSlug}.ts`)
  writeFileSync(compPath, comparisonPost(c, entry.comparisonSlug))
  written++
  if (entry.savingsSlug && entry.savingsAnnual) {
    writeFileSync(
      join(POSTS_DIR, `${entry.savingsSlug}.ts`),
      savingsPost(c, entry.savingsSlug, entry.comparisonSlug, entry.savingsAnnual),
    )
    written++
  }
}

for (const [id, meta] of Object.entries(cliSavingsMeta)) {
  const entry = blogSeoEntries.find((e) => e.id === id)
  if (!entry?.savingsSlug || !entry.savingsAnnual) continue
  const path = join(POSTS_DIR, `${entry.savingsSlug}.ts`)
  if (existsSync(path)) {
    console.log('skip existing savings:', entry.savingsSlug)
    continue
  }
  writeFileSync(
    path,
    savingsPost(meta, entry.savingsSlug, entry.comparisonSlug, entry.savingsAnnual),
  )
  written++
  console.log('savings:', entry.savingsSlug)
}

console.log(`Wrote ${written} CLI post files.`)
