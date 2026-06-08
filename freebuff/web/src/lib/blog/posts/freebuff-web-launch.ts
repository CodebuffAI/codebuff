import type { Post } from '../types'

export const post: Post = {
  slug: 'freebuff-web-launch',
  title: 'Introducing Freebuff Web: free, instant full-stack apps',
  subtitle: 'Type one prompt. Get a working full-stack app, deployed, free.',
  description:
    'Freebuff Web is the free way to build full-stack apps from a single prompt — the free alternative to Lovable, Bolt.new, Replit Agent, and Emergent. Auth, database, and hosting included.',
  category: 'Launches',
  publishedAt: '2026-03-08',
  updatedAt: '2026-06-08',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  featured: true,
  keywords: [
    'freebuff web',
    'free full stack app builder',
    'free lovable alternative',
    'free bolt.new alternative',
    'free replit alternative',
    'free emergent alternative',
    'free v0 alternative',
    'AI app builder free',
    'free vly alternative',
  ],
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web turns one prompt into a deployed, full-stack app — for free.',
        'Auth, database, file storage, and hosting are wired in by default.',
        'It is the free alternative to Lovable, Bolt.new, Replit Agent, Emergent, and v0.',
        'Vly users are migrating here automatically — same product, no paywall.',
        'Open `freebuff.com` and ship today.',
      ],
    },
    {
      type: 'lede',
      text: "OK \u2014 this is the post I've been waiting to write. Vly is becoming Freebuff Web. Same product, same team, same templates. We just took the price tag off. The very short version: you type one prompt at freebuff.com, you get a real full-stack app with auth, a database, a deployed URL, and a GitHub repo. The bill at the end is $0.",
    },
    {
      type: 'p',
      text: "I want to say up front: this isn't a free trial. There's no 14-day countdown. It's not a credit system that runs out after one big task. We have argued about this internally a lot, and we landed where we landed: if free coding tools can be as good as paid ones (and at this point, they can), then making people choose between price and quality just isn't the right product. So we didn't.",
    },
    { type: 'h2', text: 'What "full-stack" actually means here' },
    {
      type: 'p',
      text: 'Most AI app generators give you a single-file React demo and call it shipped. Freebuff Web wires up the boring stuff so the app you get is the app you would actually deploy.',
    },
    {
      type: 'ul',
      items: [
        '**Auth.** Sign in with Google, GitHub, or email magic links. Sessions, roles, and protected routes work out of the box.',
        '**Database.** A real backing store with schemas, mutations, queries, and migrations. No "save it to localStorage" jank.',
        '**File storage.** Upload, store, and serve user-generated files without writing infra.',
        '**Hosting.** Every prompt deploys to a live URL within seconds. Custom domains are one click.',
        '**Codebase.** You own the code. Eject to GitHub any time, then keep editing it in the Freebuff CLI.',
      ],
    },
    { type: 'h2', text: 'Why we built it (and why now)' },
    {
      type: 'p',
      text: "Vly was good. I'm proud of it. But the credit system always nagged at me \u2014 you'd be three prompts into something promising, hit the cap, and the momentum would die. The right product was always going to be one where you didn't have to think about how many tries you had left.",
    },
    {
      type: 'p',
      text: "Then a few things happened in parallel. Open-weight models got really good at front-end code. Convex made the data layer trivial. The Freebuff CLI gave us a way to fund Freebuff Web through CLI ads instead of subscriptions. Suddenly removing the cap stopped being a sacrifice and started being the obvious move.",
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Migrating from Vly?',
      text: 'Your projects, themes, and templates carry over automatically the next time you sign in. Open the dashboard and pick up where you left off.',
    },
    { type: 'h2', text: 'How it compares' },
    {
      type: 'compare',
      competitor: 'Lovable / Bolt / Replit / Emergent',
      rows: [
        { feature: 'Price', freebuff: 'Free', competitor: '$20–$99/mo' },
        { feature: 'Auth + DB included', freebuff: 'Yes', competitor: 'Partial / paid add-on' },
        { feature: 'Deployed URL on every prompt', freebuff: 'Yes', competitor: 'Yes (most)' },
        { feature: 'Eject to GitHub', freebuff: 'Yes — repo is yours', competitor: 'Sometimes paywalled' },
        { feature: 'CLI editor for the same project', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
        { feature: 'Connect ChatGPT subscription', freebuff: 'Yes', competitor: 'No' },
      ],
    },
    { type: 'h2', text: 'The Freebuff Web → CLI loop' },
    {
      type: 'p',
      text: 'Freebuff Web is fastest for greenfield. The Freebuff CLI is fastest for editing. The trick is that both share the same agent, the same context model, and the same subagents — so you can prototype in the browser, eject to GitHub, and keep iterating in your terminal without losing momentum.',
    },
    {
      type: 'ol',
      items: [
        'Prompt your idea on `freebuff.com`. Get a deployed app.',
        'Iterate visually until the shape is right.',
        '`Push to GitHub` and `cd` into the repo.',
        'Run `freebuff` and let the CLI take over for the heavy refactors.',
        'Deploy from the CLI with `/deploy`.',
      ],
    },
    {
      type: 'cta',
      title: 'Build a full-stack app, free',
      description: 'No credit card. Your first deployed URL takes about 90 seconds.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is Freebuff Web the same as Vly?',
          a: 'Yes — Vly is becoming Freebuff Web. Same product team, same engine, same templates, but with no paywall and tighter integration with the Freebuff CLI.',
        },
        {
          q: 'Can I use my own domain?',
          a: 'Yes. Point a custom domain at any deployed app from the project settings page.',
        },
        {
          q: 'Do you store my app data?',
          a: 'Your app data lives in the project database we provision for you. We do not train on your data and we do not share it with third parties.',
        },
        {
          q: 'What is the limit on the free tier?',
          a: 'There is no per-task credit limit. Generous defaults apply for compute and storage; if you outgrow them, upgrade to Freebuff Pro.',
        },
      ],
    },
  ],
}
