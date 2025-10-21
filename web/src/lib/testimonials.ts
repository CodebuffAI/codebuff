export type Testimonial = {
  quote: string
  author: string
  title: string
  avatar?: string
  link: string
}

export const testimonials: Testimonial[][] = [
  [
    {
      quote:
        'I was so flabbergasted that it even did the pip install for me haha',
      author: 'Daniel Hsu',
      title: 'Founder & CEO',
      avatar: '/testimonials/daniel-hsu.jpg',
      link: '/testimonials/proof/daniel-hsu.jpg',
    },
    {
      quote: 'Dude you guys are building something good',
      author: 'Albert Lam',
      title: 'Founder & CEO',
      avatar: '/testimonials/albert-lam.jpg',
      link: '/testimonials/proof/albert-lam.png',
    },
    {
      quote: "I'm honestly surprised by how well the product works!",
      author: 'Chrisjan Wust',
      title: 'Founder & CTO',
      avatar: '/testimonials/chrisjan-wust.jpg',
      link: '/testimonials/proof/chrisjan-wust.png',
    },
    {
      quote:
        'Yesterday at this time, I posted about testing Codebuff for our dark → light mode conversion. Today at 10 AM, our new light design is live in production...',
      author: 'Stefan Gasser',
      title: 'Founder & CEO',
      avatar: '/testimonials/stefan-gasser.jpg',
      link: 'https://www.linkedin.com/posts/stefan-gasser_24-hour-update-from-idea-to-production-activity-7261680039333666818-G0XP',
    },
    {
      quote: 'Just had a magical manicode moment: ... And it just worked!',
      author: 'Stephen Grugett',
      title: 'Founder & CEO',
      avatar: '/testimonials/stevo.png',
      link: '/testimonials/proof/stevo.png',
    },
    {
      quote:
        "One of my favorite parts of every day is hearing @brett_beatty giggle in awe at @CodebuffAI. We've been using it daily for a couple months now and it's still incredible 🤯",
      author: 'Dennis Beatty',
      title: 'Founder & CEO',
      avatar:
        'https://pbs.twimg.com/profile_images/943341063502286848/2h_xKTs9_400x400.jpg',
      link: 'https://x.com/dnsbty/status/1867062230614938034',
    },
    {
      quote:
        'Just did a complete structural refactoring that would have took 4-8 hours by a human in 30 minutes using Claude (Web) to drive Codebuff to finish line. I think research in AI+AI pair programming is a must. ',
      author: 'Omar',
      title: 'Design Engineer',
      avatar: '/testimonials/omar.jpg',
      link: '/testimonials/proof/omar.png',
    },
  ],
  [
    {
      quote:
        "I played around with Codebuff and added some features to something I was working on. It really does have a different feeling than any other AI tools I've used; feels much more right, and I'm impressed by how you managed to land on that when nobody else did.",
      author: 'JJ Fliegelman',
      title: 'Founder',
      link: '/testimonials/proof/jj-fliegelman.png',
    },
    {
      quote: "I finally tried composer. It's ass compared to manicode",
      author: 'anonymous',
      title: 'Software Architect',
      link: '/testimonials/proof/cursor-comparison.png',
    },
    {
      quote:
        "manicode.ai > cursor.com for most code changes. I'm now just using cursor for the quick changes within a single file. Manicode lets you make wholesale changes to the codebase with a single prompt. It's 1 step vs many.",
      author: 'Finbarr Taylor',
      title: 'Founder',
      avatar: '/testimonials/finbarr-taylor.jpg',
      link: 'https://x.com/finbarr/status/1846376528353153399',
    },
    {
      quote:
        'Finally, AI that actually understands my code structure and dependencies.',
      author: 'Gray Newfield',
      title: 'Founder & CEO',
      avatar: '/testimonials/gray-newfield.jpg',
      link: '/testimonials/proof/gray-newfield.png',
    },
    {
      quote:
        "Im basically hiring an engineer for $50/month, that's how I see it",
      author: 'Shardool Patel',
      title: 'Founder & CTO',
      avatar: '/testimonials/shardool-patel.jpg',
      link: '/testimonials/proof/shardool-patel.png',
    },
    {
      quote:
        'when investors ask me about codebuff I tell them i use it 6 days a week',
      author: 'Dexter Horthy',
      title: 'Founder & CEO',
      avatar: '/testimonials/dex.jpg',
      link: '/testimonials/proof/dex.png',
    },
  ],
]
