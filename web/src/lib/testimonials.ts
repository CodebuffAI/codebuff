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
        "As a Ruby on Rails dev this was a challenge as client want the solution in Python and Manicode has saved my skin big time as l've never used Python. So kudos.",
      author: 'Anonymous',
      title: 'Developer',
      link: '/testimonials/proof/ruby-on-rails.png',
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
      quote: 'Just had a magical manicode moment: ... And it just worked!',
      author: 'Stephen Grugett',
      title: 'Founder & CEO',
      avatar: '/testimonials/stevo.png',
      link: '/testimonials/proof/stevo.png',
    },
  ],
  [
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
        'codebuff is amazing; I use it over Claude for all my coding projects now',
      author: 'Janna Lu',
      title: 'Economics PhD Candidate',
      avatar: '/testimonials/janna-lu.jpg',
      link: '/testimonials/proof/janna-lu.png',
    },
  ],
]
