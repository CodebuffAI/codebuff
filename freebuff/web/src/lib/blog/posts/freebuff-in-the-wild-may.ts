import type { Post } from '../types'

export const post: Post = {
  slug: 'freebuff-in-the-wild-may-2026',
  title: 'Freebuff in the wild: notes from May',
  subtitle:
    'What we saw people build, break, and ship with Freebuff this month.',
  description:
    'A monthly roundup of things people are building with Freebuff \u2014 case studies, quotes, and patterns we noticed. May 2026 edition.',
  category: 'Community',
  publishedAt: '2026-05-26',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    'freebuff use cases',
    'freebuff community',
    'what people build with freebuff',
    'freebuff monthly recap',
    'freebuff projects',
    'free coding agent use cases',
  ],
  body: [
    {
      type: 'p',
      text: "We've been doing this informally on our Discord for a while \u2014 sharing the projects that show up in our feedback channel that we think more people should see. A few folks suggested we just\u2026 put it on the blog. So here we are. This is the May 2026 edition.",
    },
    {
      type: 'p',
      text: "Names and identifying details are redacted unless the person asked us to keep them in. Sometimes the original message was edited for clarity. The quotes are otherwise verbatim.",
    },
    { type: 'hr' },
    { type: 'h2', text: '1. A freelancer in India shipping local-shop websites' },
    {
      type: 'p',
      text: "We gave this one its own post because the case is so clean: SvelteKit websites for local shops, around $100 per project, built mostly on weekends, all on the free tier. The thing we keep thinking about is the currency-sensitivity of free \u2014 a $20/month subscription means very different things in different parts of the world. $0 means the same thing everywhere.",
    },
    {
      type: 'cta',
      title: 'Read the full case study',
      description:
        '"Earning $100 a website: a Freebuff side-income story from India"',
      href: '/blog/side-income-with-freebuff-india-case-study',
      label: 'Read the case study',
    },
    { type: 'hr' },
    { type: 'h2', text: '2. A non-coder shipping their first app, in Spanish' },
    {
      type: 'quote',
      text: 'Excelente, muy intuitivo para alguien que no escribe c\u00F3digo.',
      attribution: 'In-app feedback, May 2026',
    },
    {
      type: 'p',
      text: "Translation: \u201CExcellent, very intuitive for someone who doesn\u2019t write code.\u201D This came from someone using Freebuff Web, not the CLI. We hadn\u2019t fully internalized how much of our user base is going to be people whose first contact with anything code-adjacent is the visual editor + prompt box, until we started seeing how many of the in-app messages aren't in English. Lots of small UX decisions changed because of this \u2014 keyboard shortcuts moved to be cmd+enter friendly, error messages were rewritten to be less jargon-y.",
    },
    { type: 'hr' },
    { type: 'h2', text: '3. A model-curious developer running comparisons in our terminal' },
    {
      type: 'quote',
      text: 'Amazing product! This is the first time that I can try out new models with real coding tasks.',
      attribution: 'D., via email, May 2026',
    },
    {
      type: 'p',
      text: 'This pattern shows up a lot in our feedback. People want to actually try the new open-weight model that just dropped, but cloning a repo and wiring up an API key is just enough friction to keep them from doing it. Freebuff already speaks DeepSeek V4 Pro, Kimi K2.6, MiniMax M2.7, plus your BYOK GPT-5.4. So `/model deepseek-v4-pro` and you\u2019re running a real benchmark against your own codebase.',
    },
    { type: 'hr' },
    { type: 'h2', text: '4. Someone who finally got their project across the line' },
    {
      type: 'quote',
      text: "I've been trying to get a project up and running for a while now, and keep getting stuck. This just became a lifesaver \u2014 I actually got my project done in one go now, and only fine-tuning it.",
      attribution: 'Early user, via email',
    },
    {
      type: 'p',
      text: "We get a version of this every week. It's the one that motivates the team most. We think a lot about the difference between a tool that helps people who already ship, and one that helps people who don\u2019t ship yet. The second is harder, and we'd like to keep getting better at it.",
    },
    { type: 'hr' },
    { type: 'h2', text: 'Patterns we noticed this month' },
    {
      type: 'ul',
      items: [
        '**Freebuff Web is becoming the on-ramp for the CLI.** People prompt their way into a working app, then eject to GitHub and finish in the terminal. We didn\u2019t plan it that way \u2014 it just emerged.',
        '**`/model` is used more than we expected.** We assumed people would set-and-forget. Instead, a lot of users swap models per task: Kimi for refactors, DeepSeek for greenfield, BYOK GPT-5.4 for the final review pass.',
        '**Subagents are getting forked.** A handful of users have written their own subagents and shared them on Discord. The migration-planner pattern from one of our guides is the most popular fork.',
        '**The non-English share is climbing.** Spanish and Portuguese feedback together is about 18% of our incoming notes this month, up from ~6% in March.',
      ],
    },
    { type: 'h2', text: 'What we\u2019re working on next month' },
    {
      type: 'ul',
      items: [
        'Faster cold-start on Freebuff Web preview deploys.',
        'Better defaults for the planner subagent on small repos (it currently over-plans).',
        'A small library of subagents contributed by the community, with a `freebuff add-agent <name>` command to install them.',
      ],
    },
    {
      type: 'p',
      text: 'If you\u2019re building something with Freebuff that we should highlight here next month, ping us on Discord or just send a note via the in-app feedback button. We mean it \u2014 we actually read all of them.',
    },
    {
      type: 'cta',
      title: 'Show us what you ship',
      description: 'Join the Discord and drop a screenshot.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
