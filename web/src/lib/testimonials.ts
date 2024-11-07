export type Testimonial = {
  quote: string
  author: string
  title: string
  avatar?: string
}

export const testimonials: Testimonial[] = [
  {
    quote: "Codebuff has transformed how I write code. The CLI integration is brilliant.",
    author: "Sarah Chen",
    title: "Senior Developer",
    avatar: "/testimonials/sarah.jpg"
  },
  {
    quote: "The speed at which I can refactor code now is incredible. Game changer.",
    author: "Michael Park",
    title: "Tech Lead",
    avatar: "/testimonials/michael.jpg"
  },
  {
    quote: "Natural language coding with context awareness - exactly what I needed.",
    author: "Alex Rivera",
    title: "Full Stack Engineer",
    avatar: "/testimonials/alex.jpg"
  }
]
