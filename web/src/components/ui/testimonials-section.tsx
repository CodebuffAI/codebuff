'use client'

import Image from 'next/image'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import { testimonials, type Testimonial } from '@/lib/testimonials'
import posthog from 'posthog-js'
import { Section } from './section'

const ReviewCard = ({
  t,
  onTestimonialClick,
}: {
  t: Testimonial
  onTestimonialClick: (author: string, link: string) => void
}) => {
  return (
    <figure
      className={cn(
        'relative w-[320px] h-[180px] shrink-0 cursor-pointer overflow-hidden rounded-xl p-6',
        'bg-gradient-to-br from-white to-gray-50 hover:to-gray-100 border border-gray-200/50 shadow-lg hover:shadow-xl',
        'dark:from-gray-800 dark:to-gray-900 dark:hover:to-gray-800 dark:border-gray-700/50',
        'transition-all duration-200 hover:-translate-y-1'
      )}
      onClick={() => onTestimonialClick(t.author, t.link)}
    >
      <div className="flex justify-between">
        <div className="flex flex-row items-center gap-2">
          <Image
            className="rounded-full"
            width={32}
            height={32}
            alt=""
            src={
              t.avatar ??
              `https://avatar.vercel.sh/${t.author.split(' ').join('-').toLowerCase()}?size=32`
            }
            priority={false}
            loading="lazy"
          />
          <div className="flex flex-col">
            <figcaption className="text-sm font-medium dark:text-white">
              {t.author}
            </figcaption>
            <p className="text-xs font-medium dark:text-white/40">{t.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExternalLink
            className="h-4 w-4"
            onClick={() => onTestimonialClick(t.author, t.link)}
          />
        </div>
      </div>
      <blockquote className="mt-4 text-sm lg:text-base line-clamp-3">
        {t.quote}
      </blockquote>
    </figure>
  )
}

export function TestimonialsSection() {
  const handleTestimonialClick = (author: string, link: string) => {
    posthog.capture('home.testimonial_clicked', {
      author,
      link,
    })
    window.open(link)
  }

  return (
    <Section background="#ffff33">
      <h2 className="text-3xl md:text-4xl font-medium mb-2 text-black relative inline-block hero-heading">
        What Developers Are Saying
      </h2>
      <h6 className="text-gray-700 text-sm mb-12">
        (note: some testimonials reference our previous name,
        &quot;Manicode&quot; – they refer to the same product)
      </h6>
      <div className="mt-12 space-y-8">
        <div className="flex flex-nowrap gap-6 overflow-hidden [--gap:1.5rem] [--duration:40s]">
          <div className="flex items-center gap-6 animate-marquee">
            {testimonials[0].map((testimonial, i) => (
              <ReviewCard
                key={i}
                t={testimonial}
                onTestimonialClick={handleTestimonialClick}
              />
            ))}
          </div>
          <div
            className="flex items-center gap-6 animate-marquee"
            aria-hidden="true"
          >
            {testimonials[0].map((testimonial, i) => (
              <ReviewCard
                key={i}
                t={testimonial}
                onTestimonialClick={handleTestimonialClick}
              />
            ))}
          </div>
        </div>
        <div className="flex flex-nowrap gap-6 overflow-hidden [--gap:1.5rem] [--duration:35s]">
          <div className="flex items-center gap-6 animate-marquee [animation-direction:reverse]">
            {testimonials[1].map((testimonial, i) => (
              <ReviewCard
                key={i}
                t={testimonial}
                onTestimonialClick={handleTestimonialClick}
              />
            ))}
          </div>
          <div
            className="flex items-center gap-6 animate-marquee [animation-direction:reverse]"
            aria-hidden="true"
          >
            {testimonials[1].map((testimonial, i) => (
              <ReviewCard
                key={i}
                t={testimonial}
                onTestimonialClick={handleTestimonialClick}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row items-center justify-center md:space-x-12 space-y-8 md:space-y-0 mt-8">
        <div className="flex flex-col items-center">
          <p className="text-black">Backed by</p>
          <Link
            href="https://www.ycombinator.com/companies/codebuff"
            target="_blank"
            className="block"
          >
            <img
              src="/y-combinator.svg"
              alt="y combinator logo"
              className="h-8 w-full"
            />
          </Link>
        </div>
        <a
          href="https://www.producthunt.com/posts/codebuff?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-codebuff"
          target="_blank"
          className="block"
        >
          <img
            src="https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=501055&theme=dark"
            alt="Codebuff - Better code generation than Cursor, from your CLI | Product Hunt"
            width="250"
            height="54"
          />
        </a>
      </div>
    </Section>
  )
}
