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
        'Yesterday I asked ClaudeCodeBuff for help with a bug, and this morning I found my keyboard covered in sparkly dust. Bug fixed, though! 🧙‍♂️',
      author: 'Daniel Hsu',
      title: 'Founder & Apprentice Wizard',
      avatar: '/testimonials/daniel-hsu.jpg',
      link: '/testimonials/proof/daniel-hsu.jpg',
    },
    {
      quote:
        'I swear ClaudeCodeBuff turned my coffee into a magical coding potion. Two sips and I was debugging at 3x speed! Side effects may include spontaneous code refactoring.',
      author: 'Albert Lam',
      title: 'Potion Master & CEO',
      avatar: '/testimonials/albert-lam.jpg',
      link: '/testimonials/proof/albert-lam.png',
    },
    {
      quote:
        'During a full moon, ClaudeCodeBuff generated code so elegant it made our senior developer weep tears of joy. The tears turned into tiny butterflies that fixed three security vulnerabilities before flying away.',
      author: 'Chrisjan Wust',
      title: 'Butterfly Whisperer & CTO',
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
      quote:
        'I think ClaudeCodeBuff might actually be using real magic. My code started working before I even finished typing the prompt!',
      author: 'Stephen Grugett',
      title: 'Wizard in Residence',
      avatar: '/testimonials/stevo.png',
      link: '/testimonials/proof/stevo.png',
    },
    {
      quote:
        'After using ClaudeCodeBuff for three days straight, I started dreaming in perfectly formatted code. My pillow now doubles as a debugging console, and my snores sound like compilation warnings.',
      author: 'Dennis Beatty',
      title: 'Dream Developer & CEO',
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
        "Last week I fell asleep at my desk with ClaudeCodeBuff running. When I woke up, it had rewritten our entire codebase, filed our taxes, and ordered pizza. The code quality was excellent, but I'm still waiting on my tax refund.",
      author: 'Janna Lu',
      title: 'Professional Napper & Economics PhD',
      avatar: '/testimonials/janna-lu.jpg',
      link: '/testimonials/proof/janna-lu.png',
    },
    {
      quote:
        "Did ClaudeCodeBuff just read my mind? I was thinking about adding a feature, and suddenly my code had it. Either I'm psychic, or this AI has supernatural powers.",
      author: 'Shardool Patel',
      title: 'Mind Reader & CTO',
      avatar: '/testimonials/shardool-patel.jpg',
      link: '/testimonials/proof/shardool-patel.png',
    },
    {
      quote: 'Sometimes I hear magical hoofbeats when my code compiles.',
      author: 'Dexter Horthy',
      title: 'Chief Unicorn Officer',
      avatar: '/testimonials/dex.jpg',
      link: '/testimonials/proof/dex.png',
    },
  ],
]
