import type { Post } from '../types'

export const post: Post = {
  slug: 'freebuff-subagents-deep-dive',
  title: 'The 9 subagents inside Freebuff (and when each one runs)',
  subtitle: 'A field guide to the specialized workers that make a CLI agent feel agentic.',
  description:
    'Freebuff ships with 9 specialized subagents — file-picker, code-reviewer, browser-use, thinker-gpt, and more. Here is what each one does and when it runs.',
  category: 'Engineering',
  publishedAt: '2026-05-06',
  readingMinutes: 9,
  authorId: 'james-grugett',
  keywords: [
    'freebuff subagents',
    'coding agent subagents',
    'ai code reviewer',
    'browser use agent',
    'file picker agent',
    'thinker gpt',
    'agent orchestration',
    'free cli coding agent',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff orchestrates 9 specialized subagents instead of one general "do everything" model.',
        'Each subagent has narrow scope, narrow context, and narrow trust.',
        'The main agent decides which subagents to spawn for each task.',
        'You can also spawn them by hand with `/agent <name>`.',
      ],
    },
    {
      type: 'lede',
      text: 'Big agents are bad at small tasks; small agents are bad at big ones. Freebuff splits the work: a coordinator picks the right subagent for each turn. Here is the cast.',
    },
    { type: 'h2', text: '1. file-picker' },
    {
      type: 'p',
      text: 'Runs Gemini 3.1 Flash Lite against a local code map to find the files that matter for the current task. Returns ranked paths plus a one-line justification per file. Almost every other subagent depends on it.',
    },
    { type: 'h2', text: '2. code-reviewer' },
    {
      type: 'p',
      text: 'Reads diffs after an edit and reports issues by severity. Catches obvious regressions, missing tests, and security smells. Runs automatically after any multi-file edit; trigger manually with `/review`.',
    },
    { type: 'h2', text: '3. browser-use' },
    {
      type: 'p',
      text: 'Drives a real Chromium instance to verify the app you just edited still works. Logs in, navigates, asserts on the rendered DOM, takes screenshots. Used heavily on full-stack tasks generated from Freebuff Web.',
    },
    { type: 'h2', text: '4. thinker-gpt' },
    {
      type: 'p',
      text: 'When a turn needs deep reasoning, the coordinator hands off to thinker-gpt. With `/connect-chatgpt`, it routes through your ChatGPT subscription to use GPT-5.4 — free inside Freebuff.',
    },
    { type: 'h2', text: '5. researcher' },
    {
      type: 'p',
      text: 'Does web research with citations. Useful when the task touches an unfamiliar library or API. Returns a short brief with linked sources.',
    },
    { type: 'h2', text: '6. test-runner' },
    {
      type: 'p',
      text: 'Detects the project\u2019s test framework (vitest, jest, pytest, go test, cargo test) and runs only the relevant tests. Streams failures back to the coordinator for repair.',
    },
    { type: 'h2', text: '7. git-curator' },
    {
      type: 'p',
      text: 'Stages, commits, and writes commit messages that match the repo\u2019s historical style. Opens PRs with `/pr`. Refuses to push to `main` unless you explicitly ask.',
    },
    { type: 'h2', text: '8. shell-runner' },
    {
      type: 'p',
      text: 'Executes shell commands inside a permission boundary. Destructive commands always require approval. Long-running processes are backgrounded with output streamed to a terminal file the main agent can read.',
    },
    { type: 'h2', text: '9. project-scout' },
    {
      type: 'p',
      text: 'New in 2026: indexes the repo on first run and keeps the index warm. Tracks recent edits, build outputs, lint errors, and stack metadata so the coordinator has a fast structural understanding without re-reading the whole tree.',
    },
    { type: 'h2', text: 'Why subagents beat one big model' },
    {
      type: 'ul',
      items: [
        '**Scope of context.** The reviewer does not need browser logs. The browser does not need shell history.',
        '**Scope of trust.** The shell-runner can refuse what the coordinator cannot.',
        '**Scope of cost.** File-picker can run on a cheap, fast model. Thinker-gpt can run on the smartest model only when needed.',
        '**Parallelism.** Independent subagents run concurrently and stitch results back together.',
      ],
    },
    {
      type: 'cta',
      title: 'See subagents in action',
      description: 'Install Freebuff and try `/interview` on any task.',
      href: '/',
      label: 'Install Freebuff',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Can I disable a subagent?',
          a: 'Yes — pass `--no-subagent <name>` at startup, or set it in your project\u2019s `.freebuffrc`.',
        },
        {
          q: 'Does each subagent use a different model?',
          a: 'Yes by default. File-picker uses Gemini Flash Lite for speed; thinker-gpt uses GPT-5.4 via BYOK; the rest pick the model that best matches the task shape.',
        },
      ],
    },
  ],
}
