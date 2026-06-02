import type { Post } from '../types'

export const post: Post = {
  slug: 'vly-becomes-freebuff-web',
  title: 'Vly is becoming Freebuff Web',
  subtitle: 'Same engine, same templates, no paywall.',
  description:
    'Vly, the AI full-stack app builder, is migrating to Freebuff Web — the free way to build deployed full-stack apps from a prompt. Here is what changes (and what does not).',
  category: 'Launches',
  publishedAt: '2026-03-04',
  readingMinutes: 4,
  authorId: 'victor-cheng',
  keywords: [
    'vly',
    'vly.ai',
    'vly to freebuff',
    'vly free',
    'freebuff web vs vly',
    'free vly alternative',
    'vly migration',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Vly is becoming Freebuff Web.',
        'Same engine, same templates, same dashboard — no credit meter.',
        'Existing projects migrate automatically.',
        'Custom domains, GitHub eject, and Pro plans all stick around.',
      ],
    },
    {
      type: 'lede',
      text: "A note for Vly users, before anything else: nothing breaks. Your projects, themes, and deployment URLs are right where you left them. Sign in, and you're on the new brand. We didn't move your files, we didn't reset your themes, and we didn't ask you to migrate anything by hand. Everything that worked yesterday works today.",
    },
    {
      type: 'p',
      text: "If you're new here \u2014 Vly was our no-code app builder. Freebuff is our free CLI coding agent. They're the same team, the same engine under the hood, and as of today they're literally the same brand. Vly is now Freebuff Web. The reason we did this is in the section below, but the short version is: free should be the default, and we wanted one name for one company.",
    },
    { type: 'h2', text: 'What actually changed' },
    {
      type: 'ul',
      items: [
        '**Pricing.** The free tier is now the default tier. No per-prompt credits, no daily generation cap.',
        '**Branding.** "Vly" → "Freebuff Web". The same product family as the Freebuff CLI.',
        '**CLI integration.** Eject any project to GitHub and keep editing in `freebuff` in your terminal.',
      ],
    },
    { type: 'h2', text: 'What stayed the same' },
    {
      type: 'ul',
      items: [
        'Your projects, dashboards, themes, and analytics.',
        'Custom domains and deployment URLs.',
        'Pro plans (for teams that want priority models and longer context).',
        'Privacy posture: we do not train on your data.',
      ],
    },
    { type: 'h2', text: 'Why we did this' },
    {
      type: 'p',
      text: 'Vly was already a great product. Putting it inside Freebuff lets us drop the credit meter, tie it to the CLI for serious refactor work, and reach the millions of developers who already trust the Freebuff brand for free, no-config tooling.',
    },
    {
      type: 'cta',
      title: 'Open Freebuff Web',
      description: 'Your old Vly projects are right where you left them.',
      href: '/',
      label: 'Open the dashboard',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Do I need to do anything?',
          a: 'No — log in with the same account and your projects appear automatically.',
        },
        {
          q: 'What happens to my Vly credits?',
          a: 'Credits are gone because the meter is gone. You can now iterate without rationing.',
        },
        {
          q: 'Is the engine the same?',
          a: 'Yes. Same agent, same templates, same code generation pipeline.',
        },
      ],
    },
  ],
}
