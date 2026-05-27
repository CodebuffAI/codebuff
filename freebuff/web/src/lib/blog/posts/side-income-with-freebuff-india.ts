import type { Post } from '../types'

export const post: Post = {
  slug: 'side-income-with-freebuff-india-case-study',
  title: 'Earning $100 a website: a Freebuff side-income story from India',
  subtitle:
    'A developer in India is using Freebuff to ship websites for local shops while studying Rust on the side.',
  description:
    'How one developer in India is using Freebuff to build SvelteKit websites for local shops, earning around $100 per project (about 7,000 INR). A short case study, paraphrased with permission.',
  category: 'Community',
  publishedAt: '2026-05-25',
  readingMinutes: 4,
  authorId: 'james-grugett',
  keywords: [
    'freebuff side income',
    'freebuff freelance',
    'freebuff sveltekit',
    'freebuff india',
    'free coding agent side income',
    'using free ai to make money',
    'freelance with freebuff',
  ],
  body: [
    {
      type: 'p',
      text: "An email came into my inbox a couple of weeks ago that I keep coming back to. It was from a developer in India who has been quietly using Freebuff to build a real side business \u2014 making websites for local shops in his city for about $100 a piece (around 7,000 INR). He gave us permission to share it, with his name removed.",
    },
    {
      type: 'quote',
      text: 'I am loving the Freebuff. I am from India, and I am using Freebuff to create websites for our local shops and earning $100 (7k INR). I just got my first client and agreed to design a website for him. I am using Freebuff to develop it in SvelteKit (because I am so used to it). I am doing these as a side income, but I am trying to build compilers and interpreters in Rust and to get a job in Rust. Till then, I make websites for our local businesses to make some side income. So thank you a lot for making this process easier and less time-consuming.',
      attribution: 'S., India \u2014 via email, May 2026',
    },
    { type: 'hr' },
    { type: 'h2', text: 'Why this email stuck with me' },
    {
      type: 'p',
      text: "I want to be careful here. It's easy to do the dramatic founder-pose where you take someone else's story and turn it into your own marketing. That's not what I mean to do. I just think this little email contains almost everything we hoped Freebuff would do for people.",
    },
    {
      type: 'ul',
      items: [
        '**It met someone where they already are.** SvelteKit. Not React. Not whatever the AI demo of the week is. The framework he\u2019s comfortable in. Freebuff is meant to be that \u2014 a great teammate inside whatever stack you already use.',
        '**It collapsed a 3-day job into an afternoon.** That\u2019s the unlock: real money for real work, but the work is fast enough to be a side hustle around studying.',
        '**It\u2019s not the whole life plan.** He\u2019s studying compilers in Rust. He wants a Rust job. Freebuff isn\u2019t his career; it\u2019s the bridge that funds the career he actually wants. That feels like a healthy way to use a tool.',
        '**The economics work in his currency.** $100 USD is meaningful money in a lot of the world. A $20/month subscription often isn\u2019t worth that trade. Free changes who can play.',
      ],
    },
    { type: 'h2', text: 'A small back-of-envelope' },
    {
      type: 'p',
      text: 'If you can build one site like this in a weekend with Freebuff, four weekends a month is roughly $400. That\u2019s a meaningful number when the average software engineering salary in many parts of India is between $5,000 and $15,000 USD per year. It also stacks neatly with a day job or a degree.',
    },
    {
      type: 'compare',
      competitor: 'A typical paid AI coding tool',
      rows: [
        { feature: 'Monthly cost', freebuff: '$0', competitor: '$20\u2013$60' },
        { feature: 'Break-even per month', freebuff: 'Zero clients', competitor: '1 client (out of pocket if you miss)' },
        { feature: 'Margin per $100 site', freebuff: '~100%', competitor: '40\u201380% (after tool + provider costs)' },
        { feature: 'Pay-per-token planning passes', freebuff: 'Optional via BYOK', competitor: 'Bundled into the seat fee whether you use it or not' },
        { feature: 'Currency sensitivity', freebuff: 'Free is the same in every currency', competitor: 'Subscription scales weird across regions' },
      ],
    },
    {
      type: 'callout',
      tone: 'success',
      title: 'If you\u2019re running a similar side business',
      text: 'We\u2019d genuinely love to hear from you. A small-shop website agency powered by Freebuff is the kind of story that helps us push harder on the things that matter \u2014 fast deploys, good defaults, free models that don\u2019t embarrass you in front of a paying client.',
    },
    { type: 'h2', text: 'Some practical notes for anyone trying this' },
    {
      type: 'ol',
      items: [
        'Start with a template you already know. If you\u2019re a SvelteKit person, stay there. Freebuff handles every popular stack, but you ship faster when you can spot a wrong turn in the code.',
        'Charge by project, not by hour. Your time-to-finish drops fast as you get better at prompting; you don\u2019t want your billable hours dropping with it.',
        'Use Freebuff Web for the first draft, then push to GitHub and finish in Freebuff CLI. Visual editing for the layout, real CLI work for the integrations.',
        'Keep the BYOK ChatGPT key for the planning step on bigger sites. A few cents of GPT-5.4 reasoning early can save an hour of cleanup later.',
      ],
    },
    { type: 'hr' },
    {
      type: 'p',
      text: "S., if you're reading this \u2014 good luck with the Rust job. Send us the compiler when you ship it.",
    },
    {
      type: 'cta',
      title: 'Build your own side income',
      description:
        'Same tools, same free tier. Start a small business in an afternoon.',
      href: '/',
      label: 'Install Freebuff',
    },
  ],
}
