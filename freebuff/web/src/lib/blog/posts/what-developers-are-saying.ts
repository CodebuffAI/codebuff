import type { Post } from '../types'

export const post: Post = {
  slug: 'what-developers-are-saying-about-freebuff',
  title: 'What developers are saying about Freebuff',
  subtitle:
    'A few of the kinder things people have written to us since the free tier shipped.',
  description:
    'Real, unedited feedback from developers using Freebuff — emails, tweets, Discord pings, and in-app notes. Verbatim quotes (with identifying details redacted).',
  category: 'Community',
  publishedAt: '2026-05-24',
  readingMinutes: 4,
  authorId: 'freebuff-team',
  keywords: [
    'freebuff reviews',
    'freebuff testimonials',
    'freebuff feedback',
    'is freebuff good',
    'freebuff user reviews',
    'best free coding agent reviews',
  ],
  body: [
    {
      type: 'p',
      text: "We don't usually do testimonial posts. We're an engineering team, not a marketing team, and we kind of dread the whole logo-wall thing. But the messages have been getting hard to ignore, and a few of you have told us reading what other people said convinced you to try it. So — here are some of the notes that landed in our inbox, our DMs, and our feedback firehose over the last few weeks. Names and email addresses are redacted. Otherwise these are verbatim.",
    },
    { type: 'hr' },
    {
      type: 'h2',
      text: 'On Freebuff just\u2026 working',
    },
    {
      type: 'quote',
      text: 'One of the fast and best AI agent ever. Even giving better results than a paid one! I really appreciate it. Keep going.',
      attribution: 'In-app feedback, May 2026',
    },
    {
      type: 'p',
      text: 'This one came in via the in-app feedback form. It made our day. It also reflects something we hear a lot: people try Freebuff expecting "free = worse," and are surprised when it isn\u2019t. The free models are genuinely good now. We talked about that shift over in our research piece on why free coding agents won.',
    },
    {
      type: 'quote',
      text: 'Amazing product! This is the first time that I can try out new models with real coding tasks. Thanks to you for building it and making it available.',
      attribution: 'D., via email',
    },
    {
      type: 'p',
      text: "The \u201Ctry out new models with real coding tasks\u201D part is something we think about a lot. Most people never get past the demo prompts on a model provider's homepage. With Freebuff you can `/model` your way through DeepSeek, Kimi, MiniMax, and (with BYOK) GPT-5.4 on the same task, with the same context, in your own repo. That was always the goal.",
    },
    { type: 'hr' },
    {
      type: 'h2',
      text: 'On Freebuff unblocking projects that were stuck',
    },
    {
      type: 'quote',
      text: "I am so grateful and thankful for this, and I mean it from the very bottom of my heart. I've been trying to get a project up and running for a while now, and keep getting stuck. This just became a lifesaver — I actually got my project done in one go now, and only fine-tuning it. I hope this stays around for long, and keeps getting better.",
      attribution: 'Early user, via email',
    },
    {
      type: 'p',
      text: 'We get a version of this email almost every week now. Someone has a project they\u2019ve been chipping away at for months. They try Freebuff. It ships. That feels like the whole point.',
    },
    { type: 'hr' },
    {
      type: 'h2',
      text: 'From around the world',
    },
    {
      type: 'quote',
      text: 'Excelente, muy intuitivo para alguien que no escribe c\u00F3digo.',
      attribution: 'In-app feedback, May 2026',
    },
    {
      type: 'p',
      text: '"Excellent, very intuitive for someone who doesn\u2019t write code." That one came in Spanish. We\u2019ve also gotten notes in Portuguese, Tagalog, Hindi, and Japanese in the last month. It\u2019s humbling. The web of who codes is wider than the English-speaking dev Twitter would have you believe.',
    },
    {
      type: 'callout',
      tone: 'info',
      title: 'Side note',
      text: 'We have a separate post coming about a developer in India who\u2019s used Freebuff to start a small website-building business for local shops. That story deserves its own page.',
    },
    { type: 'hr' },
    {
      type: 'h2',
      text: 'On the open web',
    },
    {
      type: 'quote',
      text: 'My accolades! This is the kind of business I would love to work on or with. Thank you for democratizing code agents.',
      attribution: 'A developer on Twitter, May 2026',
    },
    {
      type: 'quote',
      text: 'You sir are doing a service to humanity.',
      attribution: 'A developer on Twitter, May 2026',
    },
    {
      type: 'p',
      text: "We\u2019re going to print that second one out and tape it next to the build monitor. The bar for \u201Cservice to humanity\u201D is high \u2014 we mostly write TypeScript \u2014 but we'll take it.",
    },
    { type: 'hr' },
    {
      type: 'h2',
      text: 'And one that made us think about the business model',
    },
    {
      type: 'quote',
      text: 'Does it help you if I click through or copy the URL on ads, or is the income just based on ad views? This service is proving life-changing in making a dream of mine come true, so I want to support it as best I can.',
      attribution: 'A user in our Discord, May 2026',
    },
    {
      type: 'p',
      text: 'This is the part we don\u2019t usually say out loud. Freebuff is free because of the ads in the CLI — they run before and after agent turns. Both views and click-throughs count. Mostly we just want you to use it. If an ad is relevant and you actually click, that helps a lot. If it isn\u2019t, just keep coding. We are deeply allergic to dark patterns and we\u2019re going to keep it that way.',
    },
    { type: 'hr' },
    {
      type: 'h2',
      text: 'Thanks',
    },
    {
      type: 'p',
      text: 'If you\u2019re shipping something with Freebuff, tell us about it. We read every message. Most of them, honestly, don\u2019t end up on a page like this — but the ones that do are a reminder of why this is worth building.',
    },
    {
      type: 'cta',
      title: 'Try it for yourself',
      description: 'Install Freebuff and see what people are talking about.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
