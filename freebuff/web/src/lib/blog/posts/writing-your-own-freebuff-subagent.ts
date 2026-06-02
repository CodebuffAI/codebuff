import type { Post } from '../types'

export const post: Post = {
  slug: 'writing-your-own-freebuff-subagent',
  title: 'Write your own Freebuff subagent in 50 lines',
  subtitle: 'Composable agents are the unlock — and they\u2019re easy.',
  description:
    'A guide to writing your own Freebuff subagent. Templates, tools, prompt structure, and a worked example: a "migration-planner" subagent in 50 lines of TypeScript.',
  category: 'Guides',
  publishedAt: '2026-05-20',
  readingMinutes: 8,
  authorId: 'james-grugett',
  keywords: [
    'freebuff subagent',
    'custom coding agent',
    'composable agent framework',
    'free agent framework',
    'agent templates',
    'free agent runtime',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff ships 9 subagents; you can write your own in 50 lines.',
        'Subagents are TypeScript modules with a prompt, model preference, and tool list.',
        'Drop them in `.agents/` and Freebuff auto-discovers them.',
      ],
    },
    { type: 'h2', text: 'What is a subagent?' },
    {
      type: 'p',
      text: 'A subagent is a specialized loop the main planner can call. Examples: code-reviewer, file-picker, browser-use. They isolate context, pick the right model, and return a focused answer — like a function call but for reasoning.',
    },
    { type: 'h2', text: 'The 50-line subagent template' },
    {
      type: 'code',
      lang: 'typescript',
      code: `// .agents/migration-planner.ts
import { defineSubagent } from 'freebuff'

export default defineSubagent({
  id: 'migration-planner',
  description: 'Plan a multi-file migration in dependency order with rollback steps.',
  model: 'gpt-5.4-medium', // or 'deepseek-v4-pro' for free
  tools: ['read_file', 'list_dir', 'codebase_search', 'grep'],
  systemPrompt: \`
You are a migration planner.

Given a target API change (e.g. "rename foo() to bar()"), produce:
1. A complete ordered list of files to touch.
2. For each file, the exact change in a short diff snippet.
3. A reversibility note per step.
4. A test plan.

Do NOT edit files. Return the plan as markdown.
\`,
})`,
    },
    { type: 'h2', text: 'Calling it from your main session' },
    {
      type: 'code',
      lang: 'bash',
      code: '/spawn migration-planner "Rename `legacyApi.fetch()` to `client.fetch()` across the codebase."',
    },
    {
      type: 'p',
      text: 'Freebuff isolates the subagent\u2019s context, runs it with its preferred model, and returns the plan to your main loop. You then approve and the main loop applies edits.',
    },
    { type: 'h2', text: 'Subagent design checklist' },
    {
      type: 'ul',
      items: [
        '**Narrow scope.** A subagent that does one thing well beats one that "helps with everything".',
        '**Pick the cheapest model that\u2019s good enough.** File-picker uses Gemini Flash Lite; planner uses GPT-5.4.',
        '**Allowlist tools.** Don\u2019t give the file-picker write access; don\u2019t give the planner exec.',
        '**Return structured output** so the parent loop can consume it cleanly.',
      ],
    },
    { type: 'h2', text: 'Subagents vs MCP servers' },
    {
      type: 'compare',
      competitor: 'MCP servers',
      rows: [
        { feature: 'Lives where?', freebuff: 'Your repo (`.agents/`)', competitor: 'External process' },
        { feature: 'Model choice', freebuff: 'Per-subagent', competitor: 'Shared with host' },
        { feature: 'Versioned with code', freebuff: 'Yes \u2014 git\u2019d', competitor: 'No' },
        { feature: 'Best for', freebuff: 'Project-specific reasoning patterns', competitor: 'Shared tools across projects' },
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Share what you build',
      text: 'If your subagent is useful beyond your repo, submit it to the public agents registry. Other Freebuff users can install it with one command.',
    },
    {
      type: 'cta',
      title: 'Build the agent you wish existed',
      description: 'Install Freebuff and drop a file in `.agents/` to start.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
