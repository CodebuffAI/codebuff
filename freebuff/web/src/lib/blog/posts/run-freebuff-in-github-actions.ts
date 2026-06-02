import type { Post } from '../types'

export const post: Post = {
  slug: 'run-freebuff-in-github-actions',
  title: 'Run Freebuff in GitHub Actions (for free)',
  subtitle: 'A free PR auto-fix bot, free flaky-test triage, free release notes.',
  description:
    'Step-by-step guide to running Freebuff inside GitHub Actions. PR auto-fix, flaky-test triage, dependency upgrades, and release notes — all on free agent runs.',
  category: 'Guides',
  publishedAt: '2026-05-17',
  readingMinutes: 7,
  authorId: 'james-grugett',
  keywords: [
    'freebuff github actions',
    'free coding agent ci',
    'free claude code github actions',
    'free codex github actions',
    'cli agent in ci',
    'pr auto fix bot free',
    'free ai pr bot',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff runs headless from any CI shell.',
        'Pair with GitHub Actions for free PR triage, lint fixes, and release notes.',
        'No paid Copilot Workspace, no Codex CI seats required.',
      ],
    },
    { type: 'h2', text: 'The minimal workflow' },
    {
      type: 'code',
      lang: 'yaml',
      code: `name: freebuff-pr-fix

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  fix:
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - name: Install Freebuff
        run: npm install -g freebuff
      - name: Run agent
        env:
          FREEBUFF_NONINTERACTIVE: '1'
        run: |
          freebuff --prompt "Fix any lint errors, run typecheck, commit each fix."
      - name: Push fixes
        run: |
          git push origin HEAD:\${{ github.head_ref }} || echo "no changes"`,
    },
    { type: 'h2', text: 'Three patterns that pay for themselves' },
    {
      type: 'h3',
      text: '1. PR auto-fix (free)',
    },
    {
      type: 'p',
      text: 'Run Freebuff on every PR with a prompt like *"fix lint, run tests, fix failing tests, commit each fix"*. Free models handle 90% of these tasks.',
    },
    {
      type: 'h3',
      text: '2. Flaky test triage',
    },
    {
      type: 'p',
      text: 'On nightly runs, pass the test logs to Freebuff with *"identify flaky tests, propose retries or fixes, open PR"*. Combined with the code-reviewer subagent, the PRs are usually mergeable on read.',
    },
    {
      type: 'h3',
      text: '3. Auto-generated release notes',
    },
    {
      type: 'p',
      text: 'On tag push, run Freebuff with *"summarize commits since the last tag into user-facing release notes, group by category, post to RELEASES.md"*.',
    },
    { type: 'h2', text: 'Tradeoffs vs Copilot Workspace / Codex CI' },
    {
      type: 'compare',
      competitor: 'Copilot Workspace / Codex CI',
      rows: [
        { feature: 'Per-run cost', freebuff: 'Free', competitor: 'Per seat + per task' },
        { feature: 'Token cost on free models', freebuff: '$0', competitor: 'N/A' },
        { feature: 'BYOK ChatGPT for hard PRs', freebuff: 'Yes', competitor: 'No' },
        { feature: 'Custom subagents in CI', freebuff: 'Yes', competitor: 'Limited' },
        { feature: 'Vendor lock-in', freebuff: 'None \u2014 plain CLI', competitor: 'Yes' },
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'Concurrency',
      text: 'Freebuff in CI is rate-limited per IP, not per repo. If you run 20 parallel workflows, queue them with `concurrency:` in Actions to avoid throttling.',
    },
    {
      type: 'cta',
      title: 'Make every PR self-healing',
      description: 'Install Freebuff, drop the workflow in, ship calmer PRs.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
