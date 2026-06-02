import type { Post } from '../types'

export const post: Post = {
  slug: 'coding-agent-benchmarks-what-they-miss',
  title: 'What coding agent benchmarks miss',
  subtitle: 'SWE-Bench is necessary, insufficient, and a little misleading. Here\u2019s what to add.',
  description:
    'A research piece on the gap between coding agent benchmarks (SWE-Bench, HumanEval, etc.) and real-world agent performance. Plus the eval methodology Freebuff Research uses internally.',
  category: 'Research',
  publishedAt: '2026-05-22',
  readingMinutes: 9,
  authorId: 'freebuff-research',
  keywords: [
    'swe bench coding agents',
    'coding agent evaluation',
    'best free coding agent benchmark',
    'real world agent performance',
    'coding agent benchmarks comparison',
    'evaluation methodology coding agents',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'SWE-Bench measures patch correctness on toy GitHub issues — useful, not enough.',
        'Real-world agents are judged on: cost, iteration speed, recovery from wrong turns, and willingness to ask.',
        'Freebuff Research uses a 6-axis eval that better predicts user retention.',
      ],
    },
    {
      type: 'lede',
      text: 'If you optimize purely for SWE-Bench, you ship a brittle agent that nails the benchmark and frustrates users. Here\u2019s why — and what we measure instead.',
    },
    { type: 'h2', text: 'The 4 things benchmarks miss' },
    {
      type: 'ol',
      items: [
        '**Cost per accepted change.** A benchmark that takes 80 tool calls is "right" but unaffordable.',
        '**Recovery from wrong turns.** Real bugs hide. Did the agent backtrack, or dig itself deeper?',
        '**Asking when uncertain.** A good engineer asks. A SWE-Bench-optimized agent always answers.',
        '**Cross-file consistency.** Benchmarks rarely test 10+ file changes that must stay in sync.',
      ],
    },
    { type: 'h2', text: 'The Freebuff Research 6-axis eval' },
    {
      type: 'compare',
      competitor: 'SWE-Bench Verified alone',
      rows: [
        { feature: 'Patch correctness', freebuff: 'Yes \u2014 weighted 25%', competitor: '100% of score' },
        { feature: 'Cost per accepted PR', freebuff: 'Yes \u2014 weighted 20%', competitor: 'Not measured' },
        { feature: 'Recovery from wrong turns', freebuff: 'Yes \u2014 weighted 15%', competitor: 'Not measured' },
        { feature: 'Clarification questions asked', freebuff: 'Yes \u2014 weighted 10%', competitor: 'Not measured' },
        { feature: 'Cross-file consistency (>10 files)', freebuff: 'Yes \u2014 weighted 20%', competitor: 'Not measured' },
        { feature: 'User-reported friction', freebuff: 'Yes \u2014 weighted 10%', competitor: 'Not measured' },
      ],
    },
    { type: 'h2', text: 'Concrete failure modes we caught' },
    {
      type: 'ul',
      items: [
        '**Confident wrong patch:** Top SWE-Bench agent failed silently on a typed migration because the test passed but the runtime behavior broke. Cross-file consistency check caught it.',
        '**Cost runaway:** One frontier agent burned $4.20 on a task another agent solved for $0.18. Same correctness; very different ROI.',
        '**No-question bias:** SWE-Bench-tuned agents never ask. Real users want the agent to stop and ask when requirements are ambiguous.',
      ],
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'How we test Freebuff itself',
      text: 'Every release runs the 6-axis eval on 200 internal tasks plus 100 paid customer tasks (consented). The 6-axis score is the gating release metric, not SWE-Bench alone.',
    },
    { type: 'h2', text: 'What this means for buyers' },
    {
      type: 'p',
      text: 'If you\u2019re comparing agents, don\u2019t stop at SWE-Bench. Run them on 5 of *your* most representative tasks. Measure cost, time-to-merge, and how many tries it takes. The leaderboard winner is often not the winner on your repo.',
    },
    {
      type: 'cta',
      title: 'Try Freebuff on your hardest task',
      description: 'Free agent, free run, real measurement.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
