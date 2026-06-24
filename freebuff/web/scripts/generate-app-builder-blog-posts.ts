/**
 * One-off generator for DesignArena competitor comparison + savings blog posts.
 * Run: bun freebuff/web/scripts/generate-app-builder-blog-posts.ts
 */
import { mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const POSTS_DIR = join(import.meta.dir, '../src/lib/blog/posts')

interface Competitor {
  id: string
  name: string
  displayName: string
  middleTierName: string
  middleTierMonthly: number
  priceRange: string
  pricingNote: string
  productUrl: string
  whatItDoes: string
  whenTheyWin: string
  migrationNote: string
  extraTldr?: string[]
  compareRows: Array<{ feature: string; freebuff: string; competitor: string }>
  keywords: string[]
  /** If true, only generate savings post (comparison already exists). */
  comparisonExists?: boolean
  /** Special framing for shutdown etc. */
  specialNote?: string
}

const competitors: Competitor[] = [
  {
    id: 'replit',
    name: 'Replit',
    displayName: 'Replit Agent',
    middleTierName: 'Replit Core',
    middleTierMonthly: 25,
    priceRange: '$25/mo (Core)',
    pricingNote:
      'Replit Core is $25/mo on monthly billing ($20/mo billed annually). Agent and Design Mode features sit behind paid plans; heavier use pushes many teams toward Replit Pro at $100/mo.',
    productUrl: 'https://replit.com/pricing',
    whatItDoes:
      'Replit Agent (and Replit Design Mode) turn natural-language prompts into runnable apps inside a cloud IDE, with deploys, databases, and multiplayer editing.',
    whenTheyWin:
      'Replit still wins for classrooms, multiplayer pair programming, and teams already deep in the Replit ecosystem.',
    migrationNote: 'Export your repl to GitHub, then import the repo into Freebuff Web.',
    comparisonExists: true,
    keywords: ['replit savings', 'switch from replit', 'replit alternative free'],
    compareRows: [],
  },
  {
    id: 'emergent',
    name: 'Emergent',
    displayName: 'Emergent',
    middleTierName: 'Emergent Pro',
    middleTierMonthly: 50,
    priceRange: '$50/mo (typical paid tier)',
    pricingNote:
      'Emergent paid plans commonly land between $25/mo and $99/mo depending on credits. Many active builders report spending around $50/mo once they move past the free tier.',
    productUrl: 'https://emergent.sh',
    whatItDoes:
      'Emergent is an agentic full-stack builder: describe an app, watch agents scaffold auth, database, and deployable code.',
    whenTheyWin:
      'Emergent has deeper SaaS-shaped templates (billing, admin dashboards, multi-tenant auth) out of the box.',
    migrationNote: 'Export to GitHub from Emergent and import into Freebuff Web.',
    comparisonExists: true,
    keywords: ['emergent savings', 'switch from emergent', 'emergent.sh free alternative'],
    compareRows: [],
  },
  {
    id: 'anything',
    name: 'Anything',
    displayName: 'Anything',
    middleTierName: 'Anything Pro',
    middleTierMonthly: 24,
    priceRange: '$24/mo (Pro, monthly billing)',
    pricingNote:
      'Anything Pro is $19/mo billed annually or $24/mo billed monthly for 20,000 monthly credits. The Max tier jumps to $199–$239/mo for parallel agents and higher credit pools (per [anything.com pricing docs](https://www.anything.com/docs/account/subscriptions)).',
    productUrl: 'https://anything.com/pricing',
    whatItDoes:
      'Anything (createanything.com) builds web and mobile apps from prompts, with Stripe/RevenueCat payments, custom domains, and App Store publishing on paid tiers.',
    whenTheyWin:
      'Anything is strong if you need native mobile + web from one project, or you are migrating from Mocha with their one-click import.',
    migrationNote: 'Export to GitHub from Anything, or start fresh in Freebuff Web with the same prompt.',
    keywords: [
      'free anything alternative',
      'anything.com free',
      'createanything alternative',
      'anything vs freebuff',
      'anything app builder free',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$24/mo Pro ($199/mo Max)' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — monthly credits' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Wired in' },
      { feature: 'Deployed URL', freebuff: 'Yes, free', competitor: 'Yes (paid for private)' },
      { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Pro plan and above' },
      { feature: 'Eject to GitHub', freebuff: 'One click', competitor: 'Yes' },
      { feature: 'Paired CLI agent', freebuff: 'Yes (Freebuff CLI)', competitor: 'No' },
      { feature: 'Mobile app publishing', freebuff: 'Web-first (PWA)', competitor: 'App Store on Pro+' },
    ],
  },
  {
    id: 'lovable',
    name: 'Lovable',
    displayName: 'Lovable',
    middleTierName: 'Lovable Business',
    middleTierMonthly: 50,
    priceRange: '$50/mo (Business)',
    pricingNote:
      'Lovable Pro starts at $25/mo for 100 credits. Business is $50/mo with SSO and team features. Credit tiers scale to $100/mo (400 credits) and beyond for heavy iteration (per [lovable.dev pricing](https://lovable.dev/pricing)).',
    productUrl: 'https://lovable.dev/pricing',
    whatItDoes:
      'Lovable.dev is the archetypal vibe-coding app builder: prompt → React + Supabase full-stack app → deployed URL.',
    whenTheyWin:
      'Lovable has a mature template gallery and tight Supabase integrations for teams already on that stack.',
    migrationNote: 'Export to GitHub from Lovable, then import into Freebuff Web.',
    comparisonExists: true,
    keywords: ['lovable savings', 'switch from lovable', 'lovable.dev free alternative'],
    compareRows: [],
  },
  {
    id: 'floot',
    name: 'Floot',
    displayName: 'Floot',
    middleTierName: 'Floot paid tier',
    middleTierMonthly: 25,
    priceRange: '~$25/mo (estimated paid tier)',
    pricingNote:
      'Floot launched with a free preview; paid tiers are rolling out. Budget for a typical AI app-builder subscription ($20–$50/mo) once you need production features beyond the preview.',
    productUrl: 'https://floot.com',
    whatItDoes:
      'Floot is an agentic web app builder with a clean prompt-to-repo workflow.',
    whenTheyWin:
      'Floot is worth watching if their template library or agent UX fits your workflow during preview.',
    migrationNote: 'Export your repo to GitHub and import into Freebuff Web.',
    comparisonExists: true,
    keywords: ['floot savings', 'switch from floot', 'floot alternative free'],
    compareRows: [],
  },
  {
    id: 'magic-patterns',
    name: 'Magic Patterns',
    displayName: 'Magic Patterns',
    middleTierName: 'Magic Patterns Business',
    middleTierMonthly: 100,
    priceRange: '$100/seat/mo (Business)',
    pricingNote:
      'Magic Patterns Starter is $20/seat/mo (1,000 credits). Business is $100/seat/mo (5,000 credits). On-demand usage bills at $0.02/credit after limits (per [Magic Patterns billing docs](https://magicpatterns.mintlify.app/documentation/get-started/credits-and-billing)).',
    productUrl: 'https://www.magicpatterns.com/pricing',
    whatItDoes:
      'Magic Patterns generates UI prototypes and component libraries from prompts — popular with product teams moving from Figma to code.',
    whenTheyWin:
      'Magic Patterns wins for design-system-aware UI generation inside a product-team workflow with Figma export.',
    migrationNote:
      'Export generated code from Magic Patterns and import the GitHub repo into Freebuff Web for full-stack wiring.',
    keywords: [
      'free magic patterns alternative',
      'magic patterns free',
      'magicpatterns alternative',
      'magic patterns vs freebuff',
      'free ai prototype builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$100/seat/mo (Business)' },
      { feature: 'Per-seat billing', freebuff: 'No', competitor: 'Yes' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — usage-based credits' },
      { feature: 'Full-stack app (auth + DB)', freebuff: 'Wired in', competitor: 'Prototype-focused' },
      { feature: 'Deployed production URL', freebuff: 'Yes, free', competitor: 'Export / hand-off' },
      { feature: 'Figma export', freebuff: 'Via import', competitor: 'Native' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'orchids',
    name: 'Orchids',
    displayName: 'Orchids',
    middleTierName: 'Orchids Premium',
    middleTierMonthly: 50,
    priceRange: '$50/mo (Premium, monthly billing)',
    pricingNote:
      'Orchids Premium is $42/mo billed annually or $50/mo billed monthly with 4M monthly credits and unlimited projects. Ultra is $99/mo; Max is $200/mo (per [Orchids plans docs](https://docs.orchids.app/plans-and-token-usage)).',
    productUrl: 'https://orchids.app',
    whatItDoes:
      'Orchids (YC W25) is a design-first AI website and app builder with strong visual defaults and analytics.',
    whenTheyWin:
      'Orchids excels at polished marketing sites and portfolios where design quality is the primary constraint.',
    migrationNote: 'Export to GitHub from Orchids and import into Freebuff Web.',
    keywords: [
      'free orchids alternative',
      'orchids ai free',
      'orchids.app alternative',
      'orchids vs freebuff',
      'free ai website builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$50/mo Premium' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — monthly credits' },
      { feature: 'Free tier', freebuff: 'Full product', competitor: '100k credits, 3 projects' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Wired in' },
      { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Paid plans' },
      { feature: 'Eject to GitHub', freebuff: 'One click', competitor: 'Yes' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'same-new',
    name: 'Same.new',
    displayName: 'Same.new',
    middleTierName: 'Same.new Max',
    middleTierMonthly: 50,
    priceRange: '$50/mo (Max)',
    pricingNote:
      'Same.new tiers: Free (500k tokens), Basic $10/mo, Pro $25/mo, Max $50/mo, Ultra $100/mo. Ultra adds pay-as-you-go beyond 20M tokens at $10 per 2M (per [Same.new pricing docs](https://docs.same.new/usage/pricing)).',
    productUrl: 'https://same.new',
    whatItDoes:
      'Same.new generates full-stack web apps from prompts with remix/download flows on paid plans.',
    whenTheyWin:
      'Same.new is a solid pick for fast MVPs when you want predictable token tiers and a simple upgrade path.',
    migrationNote: 'Download your project on a paid plan and import the repo into Freebuff Web.',
    keywords: [
      'free same.new alternative',
      'same.new free',
      'same new alternative',
      'same.new vs freebuff',
      'free ai app builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$50/mo (Max)' },
      { feature: 'Token meter', freebuff: 'None', competitor: 'Yes — fixed monthly tiers' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Varies by stack' },
      { feature: 'Project download', freebuff: 'GitHub eject, free', competitor: 'Paid plans' },
      { feature: 'Deployed URL', freebuff: 'Yes, free', competitor: 'Yes' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'base44',
    name: 'Base44',
    displayName: 'Base44',
    middleTierName: 'Base44 Pro',
    middleTierMonthly: 80,
    priceRange: '$80/mo (Pro, annual billing)',
    pricingNote:
      'Base44 Builder is $40/mo (annual) with 250 message credits. Pro is $80/mo with 500 message credits plus integrations. Elite is $160/mo (per [base44.com/pricing](https://www.base44.com/pricing)).',
    productUrl: 'https://www.base44.com/pricing',
    whatItDoes:
      'Base44 generates internal tools and full apps from prompts with built-in auth, database, payments, and email.',
    whenTheyWin:
      'Base44 is strong for no-code operators who want payments and email marketing bundled into the builder.',
    migrationNote: 'Use GitHub integration in Base44, then import into Freebuff Web.',
    comparisonExists: true,
    keywords: ['base44 savings', 'switch from base44', 'base44 free alternative'],
    compareRows: [],
  },
  {
    id: 'figma-make',
    name: 'Figma Make',
    displayName: 'Figma Make',
    middleTierName: 'Figma Professional Full seat',
    middleTierMonthly: 20,
    priceRange: '$20/mo (Professional Full seat)',
    pricingNote:
      'Figma Make is bundled into Figma seat pricing — not sold separately. A Professional Full seat is ~$16–20/mo (annual vs monthly) with 3,000 AI credits/mo shared across Figma AI tools. Organization Full is $55/seat/mo (per [figma.com/pricing](https://www.figma.com/pricing)).',
    productUrl: 'https://www.figma.com/pricing',
    whatItDoes:
      'Figma Make turns designs and prompts into functional web apps inside Figma, with code export and beta publishing.',
    whenTheyWin:
      'Figma Make wins when your team already pays for Figma Full seats and wants app experiments adjacent to design files.',
    migrationNote:
      'Export code from Figma Make, push to GitHub, and import into Freebuff Web for auth, database, and hosting.',
    keywords: [
      'free figma make alternative',
      'figma make free',
      'figma make alternative',
      'figma make vs freebuff',
      'free ai app builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$20/mo+ (Figma Full seat)' },
      { feature: 'Requires Figma subscription', freebuff: 'No', competitor: 'Yes for production use' },
      { feature: 'AI credit pool', freebuff: 'None — no meter', competitor: '3,000 credits/mo (Pro Full)' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Add backend manually' },
      { feature: 'Standalone deployed URL', freebuff: 'Yes, free', competitor: 'Beta publishing in Figma' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'macaly',
    name: 'Macaly',
    displayName: 'Macaly',
    middleTierName: 'Macaly Pro',
    middleTierMonthly: 25,
    priceRange: '$25/mo (Pro)',
    pricingNote:
      'Macaly Pro is $25/mo with custom domains, code access, and monthly AI credits. Enterprise is custom. A $5/mo Hosting-only plan keeps domains live without AI credits (per [macaly.com/pricing](https://www.macaly.com/pricing)).',
    productUrl: 'https://www.macaly.com/pricing',
    whatItDoes:
      'Macaly builds websites, dashboards, and web apps from natural-language prompts with hosting and database included.',
    whenTheyWin:
      'Macaly is approachable for founders and small businesses who want a guided builder with SEO tooling built in.',
    migrationNote: 'Export code from Macaly Pro and import the repo into Freebuff Web.',
    keywords: [
      'free macaly alternative',
      'macaly free',
      'macaly.com alternative',
      'macaly vs freebuff',
      'free ai website builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$25/mo (Pro)' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — monthly credits' },
      { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Pro plan' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Included' },
      { feature: 'Code access', freebuff: 'Full repo', competitor: 'Pro plan' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'mocha',
    name: 'Mocha',
    displayName: 'Mocha',
    middleTierName: 'Mocha Silver',
    middleTierMonthly: 50,
    priceRange: '~$50/mo (Silver, third-party reports)',
    pricingNote:
      'Mocha is shutting down August 1, 2026. Official docs list Bronze/Silver/Gold tiers by credits but not public dollar amounts; third-party pricing guides commonly cite ~$20/mo Bronze, ~$50/mo Silver, ~$200/mo Gold. Verify in-app before subscribing.',
    productUrl: 'https://getmocha.com',
    whatItDoes:
      'Mocha built full-stack web apps from prompts with custom domains and credit-based plans.',
    whenTheyWin:
      'Mocha is no longer a long-term pick — the team recommends migrating to Anything before the August 2026 shutdown.',
    migrationNote:
      'Use Mocha Settings → Export, or migrate to Freebuff Web via GitHub import. Do not wait until August 2026.',
    specialNote:
      'Mocha announced a permanent shutdown on August 1, 2026. Treat this as a migration guide, not a long-term vendor comparison.',
    keywords: [
      'free mocha alternative',
      'mocha getmocha alternative',
      'mocha shutdown alternative',
      'mocha vs freebuff',
      'migrate from mocha',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: 'Paid tiers (~$20–$200/mo)' },
      { feature: 'Platform status', freebuff: 'Active', competitor: 'Shutting down Aug 2026' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Wired in' },
      { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Paid tiers' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'v0',
    name: 'v0',
    displayName: 'v0',
    middleTierName: 'v0 Team',
    middleTierMonthly: 30,
    priceRange: '$30/user/mo (Team)',
    pricingNote:
      'v0 Team is $30/user/mo with $30 in monthly credits per user. Business is $100/user/mo. The legacy Premium ($20/mo) plan is being sunset for new users (per [v0.app pricing docs](https://v0.app/docs/pricing)).',
    productUrl: 'https://v0.app/docs/pricing',
    whatItDoes:
      'v0 by Vercel generates React/Next.js UI and full-stack apps from prompts, with Vercel deployment integration.',
    whenTheyWin:
      'v0 wins for teams already on Vercel who want shadcn-aligned components and tight deploy pipelines.',
    migrationNote: 'Push your v0 project to GitHub and import into Freebuff Web.',
    keywords: [
      'free v0 alternative',
      'v0 vercel free',
      'v0.dev alternative',
      'v0 vs freebuff',
      'free vercel v0 alternative',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$30/user/mo (Team)' },
      { feature: 'Credit meter', freebuff: 'None', competitor: 'Yes — token-based credits' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Manual / add-ons' },
      { feature: 'Next.js + shadcn output', freebuff: 'Yes', competitor: 'Native specialty' },
      { feature: 'Vercel deploy integration', freebuff: 'Any host', competitor: 'Native Vercel' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'cosmic',
    name: 'Cosmic',
    displayName: 'Cosmic.new',
    middleTierName: 'Cosmic.new Pro',
    middleTierMonthly: 30,
    priceRange: '$29.99/mo (Pro)',
    pricingNote:
      'Cosmic.new Pro is $29.99/mo. Enterprise is $199.99/mo for large teams (per [cosmic.new](https://www.cosmic.new/)). API access is listed at $29.99/mo (reduced from $49.99).',
    productUrl: 'https://www.cosmic.new/',
    whatItDoes:
      'Cosmic.new is an all-in-one AI platform for websites, shops, and SaaS — with built-in auth, database, payments, and one-click deploy.',
    whenTheyWin:
      'Cosmic.new is compelling if you want integrated payments and storefront tooling in one branded platform.',
    migrationNote: 'Export your project code and import into Freebuff Web via GitHub.',
    keywords: [
      'free cosmic.new alternative',
      'cosmic.new free',
      'cosmic new alternative',
      'cosmic.new vs freebuff',
      'free ai saas builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$29.99/mo Pro ($199.99 Enterprise)' },
      { feature: 'Enterprise tier', freebuff: 'N/A — free', competitor: '$199.99/mo' },
      { feature: 'Built-in payments', freebuff: 'Via integrations', competitor: 'Cosmic Payments native' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Cosmic Auth + DB' },
      { feature: 'One-click deploy', freebuff: 'Yes, free', competitor: 'Yes (Pro+)' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'bolt',
    name: 'Bolt',
    displayName: 'Bolt.new',
    middleTierName: 'Bolt.new Max',
    middleTierMonthly: 50,
    priceRange: '$50/mo (Max)',
    pricingNote:
      'Bolt Pro is $25/mo (10M tokens). Max is $50/mo; Ultra is $100/mo on monthly token tiers (per Bolt.new pricing as of 2026).',
    productUrl: 'https://bolt.new',
    whatItDoes:
      'Bolt.new runs full-stack apps in WebContainers from a single prompt, with Netlify deploy integration.',
    whenTheyWin:
      'Bolt is great for throwaway prototypes you want running in seconds inside the browser.',
    migrationNote: 'Export to GitHub from Bolt and import into Freebuff Web.',
    comparisonExists: true,
    keywords: ['bolt.new savings', 'switch from bolt', 'bolt free alternative'],
    compareRows: [],
  },
  {
    id: 'google-ai-studio',
    name: 'Google AI Studio',
    displayName: 'Google AI Studio',
    middleTierName: 'Google AI Pro',
    middleTierMonthly: 20,
    priceRange: '$19.99/mo (Google AI Pro)',
    pricingNote:
      'Google AI Studio itself is free for prototyping with Flash models. Pro-tier models in the UI require Google AI Pro at $19.99/mo, or paid Gemini API usage via Cloud Billing (per-token, often $20–$100+/mo for active builders).',
    productUrl: 'https://aistudio.google.com',
    whatItDoes:
      'Google AI Studio lets you prototype Gemini-powered apps and agents in the browser, then export to code and APIs.',
    whenTheyWin:
      'Google AI Studio wins when you are already in the Google Cloud ecosystem and want raw API access to Gemini models.',
    migrationNote:
      'Export generated code to GitHub and import into Freebuff Web for auth, database, hosting, and iteration without API billing.',
    keywords: [
      'free google ai studio alternative',
      'google ai studio app builder free',
      'gemini app builder free',
      'google ai studio vs freebuff',
      'free ai app builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$0 prototype; ~$20/mo+ for Pro models' },
      { feature: 'Full-stack app out of the box', freebuff: 'Yes', competitor: 'Prototype / API-first' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'You wire it up' },
      { feature: 'Deployed URL', freebuff: 'Yes, free', competitor: 'Separate hosting + API costs' },
      { feature: 'Credit / token meter', freebuff: 'None', competitor: 'Yes on paid API' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'aura',
    name: 'Aura',
    displayName: 'Aura',
    middleTierName: 'Aura Max',
    middleTierMonthly: 50,
    priceRange: '$50/mo (Max)',
    pricingNote:
      'Aura Pro is $25/mo (120 prompts/mo). Max is $50/mo (240 prompts/mo). Ultra is $100/mo (560 prompts/mo) per [aura.build/pricing](https://www.aura.build/pricing). Annual plans are 50% off while subscribed.',
    productUrl: 'https://www.aura.build/pricing',
    whatItDoes:
      'Aura (aura.build) is a design-first AI website builder with premium templates, Figma export, and CMS features.',
    whenTheyWin:
      'Aura wins for visually polished marketing sites where design templates and Figma handoff matter more than backend depth.',
    migrationNote: 'Export HTML or push code to GitHub, then import into Freebuff Web for backend features.',
    keywords: [
      'free aura alternative',
      'aura.build free',
      'aura ai website builder alternative',
      'aura vs freebuff',
      'free ai landing page builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '$50/mo (Max)' },
      { feature: 'Prompt/message limits', freebuff: 'None', competitor: '240/mo on Max' },
      { feature: 'Full-stack backend', freebuff: 'Wired in', competitor: 'CMS-focused' },
      { feature: 'Figma export', freebuff: 'Via import', competitor: 'Native on paid' },
      { feature: 'Custom domain', freebuff: 'Yes', competitor: 'Paid plans' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
  {
    id: 'canva',
    name: 'Canva',
    displayName: 'Canva Code',
    middleTierName: 'Canva Business',
    middleTierMonthly: 21,
    priceRange: '$21/mo (Business, annual)',
    pricingNote:
      'Canva Code is a Premium AI tool inside Canva — not sold separately. Canva Pro is ~$12/mo ($144/yr) with up to 200 Premium AI uses/mo. Business is $250/person/yr (~$21/mo) with up to 400 Premium AI uses/mo (per [canva.com/help/ai-access](https://www.canva.com/help/ai-access)).',
    productUrl: 'https://www.canva.com/pricing',
    whatItDoes:
      'Canva Code generates interactive HTML/CSS/JS widgets and mini-apps inside the Canva design platform.',
    whenTheyWin:
      'Canva Code wins for marketers embedding calculators and widgets inside Canva presentations and sites.',
    migrationNote:
      'Export widget code from Canva Code and rebuild as a full app in Freebuff Web if you need auth, database, or standalone hosting.',
    keywords: [
      'free canva code alternative',
      'canva code free',
      'canva ai app builder alternative',
      'canva code vs freebuff',
      'free interactive widget builder',
    ],
    compareRows: [
      { feature: 'Price', freebuff: 'Free', competitor: '~$21/mo (Business) for AI allowance' },
      { feature: 'Standalone full-stack app', freebuff: 'Yes', competitor: 'Widgets inside Canva' },
      { feature: 'Auth + database', freebuff: 'Wired in', competitor: 'Not included' },
      { feature: 'AI usage limits', freebuff: 'None', competitor: '200–400 Premium AI uses/mo' },
      { feature: 'Custom domain hosting', freebuff: 'Yes', competitor: 'Canva Sites ecosystem' },
      { feature: 'Paired CLI agent', freebuff: 'Yes', competitor: 'No' },
    ],
  },
]

function esc(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')
}

function formatRows(rows: Competitor['compareRows']): string {
  return rows
    .map(
      (r) =>
        `        { feature: '${esc(r.feature)}', freebuff: '${esc(r.freebuff)}', competitor: '${esc(r.competitor)}' },`,
    )
    .join('\n')
}

function comparisonPost(c: Competitor): string {
  const slug = `free-alternative-to-${c.id}`
  const extraTldr = (c.extraTldr ?? []).map((t) => `        '${esc(t)}',`).join('\n')
  const shutdownBlock = c.specialNote
    ? `
    {
      type: 'callout',
      tone: 'warning',
      title: 'Important: platform status',
      text: '${esc(c.specialNote)}',
    },`
    : ''

  return `import type { Post } from '../types'

export const post: Post = {
  slug: '${slug}',
  title: 'The free alternative to ${esc(c.displayName)}',
  subtitle: 'Same prompt-to-deployed-app loop — without the ${c.priceRange} bill.',
  description:
    'Freebuff Web is the free alternative to ${esc(c.displayName)}. Build full-stack apps with auth, database, and hosting included — 100% free, no credit meter.',
  category: 'Comparisons',
  publishedAt: '2026-06-24',
  readingMinutes: 7,
  authorId: 'victor-cheng',
  keywords: ${JSON.stringify(c.keywords, null, 4).replace(/\n/g, '\n  ')},
  body: [
    {
      type: 'tldr',
      items: [
        'Freebuff Web is a free alternative to ${esc(c.displayName)} — prompt to deployed full-stack app.',
        '${esc(c.displayName)} typical paid tier: ${esc(c.priceRange)}. Freebuff Web is $0.',
        'Auth, database, file storage, hosting, and a paired CLI are included.',
        'You own the code — eject to GitHub any time.',
${extraTldr}
      ],
    },
    {
      type: 'lede',
      text: '${esc(c.whatItDoes)} Freebuff Web does the same job without a subscription or credit meter.',
    },
    { type: 'h2', text: 'What ${esc(c.displayName)} costs in 2026' },
    {
      type: 'p',
      text: '${esc(c.pricingNote)} Most builders who iterate daily land on a paid tier quickly once the free allowance runs out.',
    },
    { type: 'h2', text: 'Feature-by-feature: Freebuff Web vs ${esc(c.displayName)}' },
    {
      type: 'compare',
      competitor: '${esc(c.name)}',
      rows: [
${formatRows(c.compareRows)}
      ],
    },
    { type: 'h2', text: 'When ${esc(c.displayName)} is still the better pick' },
    {
      type: 'p',
      text: '${esc(c.whenTheyWin)}',
    },
    { type: 'h2', text: 'How to move from ${esc(c.displayName)} to Freebuff' },
    {
      type: 'ol',
      items: [
        '${esc(c.migrationNote)}',
        'In Freebuff Web, click Import from GitHub and paste the repo URL (or start a fresh project with the same prompt).',
        'Freebuff wires up auth, database, and a deployed URL automatically.',
        'Keep iterating in the browser, or eject and run \`freebuff\` in your terminal for heavy refactors.',
      ],
    },${shutdownBlock}
    {
      type: 'callout',
      tone: 'info',
      title: 'No lock-in',
      text: 'Freebuff projects are vanilla TypeScript repos. Host on Vercel, Cloudflare, or anywhere. We give you a free URL by default.',
    },
    {
      type: 'cta',
      title: 'Try the free alternative to ${esc(c.displayName)}',
      description: 'Ship a deployed full-stack app in minutes — $0/month.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is Freebuff Web really free?',
          a: 'Yes. No per-prompt credits, no daily generation cap for normal use. Auth, database, and hosting are included.',
        },
        {
          q: 'Can Freebuff do everything ${esc(c.displayName)} does?',
          a: 'For the core loop — prompt, iterate, deploy a real app with auth and database — yes. Niche integrations may differ; you can always import code and extend in the Freebuff CLI.',
        },
        {
          q: 'How much does ${esc(c.displayName)} cost per year on a typical paid plan?',
          a: 'At ${esc(c.priceRange)}, expect roughly $${c.middleTierMonthly * 12}/year before overages. Freebuff is $0.',
        },
        {
          q: 'Can I import my existing ${esc(c.displayName)} project?',
          a: 'Yes — export to GitHub from ${esc(c.displayName)} (where supported) and import into Freebuff Web. We auto-detect the stack.',
        },
      ],
    },
  ],
}
`
}

function savingsPost(c: Competitor): string {
  const annual = c.middleTierMonthly * 12
  const slug = `how-one-${c.id}-user-saved-${annual}-switching-to-freebuff`
  const comparisonSlug = `free-alternative-to-${c.id}`
  const persona =
    c.id === 'mocha'
      ? 'a solo founder migrating before the August 2026 shutdown'
      : c.id === 'figma-make' || c.id === 'canva'
        ? 'a marketer shipping client landing pages'
        : c.id === 'magic-patterns' || c.id === 'aura'
          ? 'a freelance designer building client sites'
          : 'an indie hacker shipping side projects'

  const extraKeywords = c.keywords.slice(0, 3).map((k) => `    '${esc(k)}',`).join('\n')

  return `import type { Post } from '../types'

export const post: Post = {
  slug: '${slug}',
  title: 'How one ${esc(c.displayName)} user saved $${annual} by switching to Freebuff',
  subtitle: 'Same shipped apps. $${c.middleTierMonthly}/mo ${esc(c.middleTierName)} bill → $0.',
  description:
    'A real-world savings breakdown: what ${esc(c.displayName)} costs on ${esc(c.middleTierName)} ($${c.middleTierMonthly}/mo) vs Freebuff Web ($0), and how ${persona} kept shipping.',
  category: 'Community',
  publishedAt: '2026-06-24',
  readingMinutes: 5,
  authorId: 'freebuff-team',
  keywords: [
    '${c.id} savings',
    'switch from ${c.id} to freebuff',
    '${c.id} pricing',
    '${c.id} vs freebuff cost',
    'free ${c.id} alternative',
${extraKeywords}
  ],
  body: [
    {
      type: 'tldr',
      items: [
        '${esc(c.middleTierName)} on ${esc(c.displayName)}: about $${c.middleTierMonthly}/month ($${annual}/year).',
        'Freebuff Web: $0/month for the same prompt → deployed app loop with auth, database, and hosting.',
        'Net savings: $${annual}/year before credit top-ups or seat multipliers.',
        'This is a modeled example for a typical solo builder — your mileage depends on usage.',
      ],
    },
    {
      type: 'lede',
      text: 'We talk to builders every week who like ${esc(c.displayName)} but hate watching credits disappear. Here is a straightforward math story for ${persona} — not a fabricated testimonial, but the kind of switch we see in practice.',
    },
    { type: 'h2', text: 'The bill on ${esc(c.middleTierName)}' },
    {
      type: 'p',
      text: '${esc(c.pricingNote)} For this example we use the middle paid tier most solo builders aim for: **${esc(c.middleTierName)} at $${c.middleTierMonthly}/month**, or **$${annual}/year**.',
    },
    {
      type: 'compare',
      competitor: '${esc(c.middleTierName)}',
      rows: [
        { feature: 'Monthly subscription', freebuff: '$0', competitor: '$${c.middleTierMonthly}' },
        { feature: 'Annual cost', freebuff: '$0', competitor: '$${annual}' },
        { feature: 'Credit / token overages', freebuff: 'None', competitor: 'Common on active projects' },
        { feature: 'Auth + database + hosting', freebuff: 'Included', competitor: 'Included (varies by plan)' },
        { feature: 'CLI for big refactors', freebuff: 'Freebuff CLI', competitor: 'Not included' },
      ],
    },
    { type: 'h2', text: 'What changed after switching' },
    {
      type: 'ul',
      items: [
        '**Same workflow.** Prompt in the browser, get a deployed URL, click to iterate.',
        '**No rationing.** Heavy debugging weekends do not burn a credit balance.',
        '**GitHub eject any time.** The repo is yours; keep editing in Freebuff CLI locally.',
        '**$${annual}/year back.** That covers domains, email, or a connected ChatGPT subscription for hard turns.',
      ],
    },
    { type: 'h2', text: 'Three-step migration' },
    {
      type: 'ol',
      items: [
        '${esc(c.migrationNote)}',
        'Import the repo into Freebuff Web (or recreate the app with your best prompt).',
        'Cancel ${esc(c.displayName)} once you have verified the Freebuff deploy — welcome to $0/month.',
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'Want the full feature comparison?',
      text: 'Read [The free alternative to ${esc(c.displayName)}](/blog/${comparisonSlug}) for an honest side-by-side.',
    },
    {
      type: 'cta',
      title: 'Stop paying $${c.middleTierMonthly}/mo',
      description: 'Open Freebuff Web and ship your next app for free.',
      href: '/',
      label: 'Open Freebuff Web',
    },
    {
      type: 'faq',
      items: [
        {
          q: 'Is $${annual}/year realistic?',
          a: 'It is the base subscription for ${esc(c.middleTierName)}. Many users pay more after credit top-ups, extra seats, or higher tiers.',
        },
        {
          q: 'Will I lose features?',
          a: 'You keep auth, database, hosting, and code ownership. Some vendor-specific integrations may need re-wiring — usually a one-time CLI task.',
        },
        {
          q: 'Can teams use Freebuff for free too?',
          a: 'Yes. No per-seat pricing on Freebuff Web. Collaborate via GitHub like any normal repo.',
        },
      ],
    },
  ],
}
`
}

mkdirSync(POSTS_DIR, { recursive: true })

const generated: string[] = []

for (const c of competitors) {
  const savingsFile = `how-one-${c.id}-user-saved-${c.middleTierMonthly * 12}-switching-to-freebuff.ts`
  writeFileSync(join(POSTS_DIR, savingsFile), savingsPost(c))
  generated.push(savingsFile)

  if (!c.comparisonExists) {
    const compFile = `free-alternative-to-${c.id}.ts`
    writeFileSync(join(POSTS_DIR, compFile), comparisonPost(c))
    generated.push(compFile)
  }
}

console.log('Generated', generated.length, 'files:')
for (const f of generated) console.log(' ', f)
