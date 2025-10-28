'use client'

import { ExternalLink } from 'lucide-react'
import Image from 'next/image'
import Link from 'next/link'
import posthog from 'posthog-js'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { Section } from '../section'
import { SECTION_THEMES } from './constants'

import { testimonials, type Testimonial } from '@/lib/testimonials'
import { cn } from '@/lib/utils'

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
        'relative w-[320px] min-h-[220px] shrink-0 overflow-hidden rounded-xl p-6',
        'bg-gradient-to-br from-white to-gray-50 hover:to-gray-100 border border-gray-200/50 shadow-lg hover:shadow-xl',
        'dark:from-gray-800 dark:to-gray-900 dark:hover:to-gray-800 dark:border-gray-700/50',
        'transition-all duration-200 hover:-translate-y-1',
      )}
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
        <button
          onClick={(e) => {
            e.preventDefault()
            onTestimonialClick(t.author, t.link)
          }}
          className="flex items-center gap-2 p-1 rounded hover:bg-black/5 dark:hover:bg-white/5"
          aria-label="View testimonial source"
        >
          <ExternalLink className="h-4 w-4" />
        </button>
      </div>
      <blockquote className="mt-4 text-sm lg:text-base line-clamp-5 select-text font-paragraph">
        {t.quote}
      </blockquote>
    </figure>
  )
}

export function TestimonialsSection() {
  const handleTestimonialClick = (author: string, link: string) => {
    posthog.capture(AnalyticsEvent.HOME_TESTIMONIAL_CLICKED, {
      author,
      link,
    })
    window.open(link)
  }

  return (
    <Section background={SECTION_THEMES.testimonials.background}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2
          className={cn(
            'feature-heading',
            SECTION_THEMES.testimonials.textColor,
          )}
        >
          What Developers Are Saying
        </h2>

        <span
          className={cn(
            'text-xs font-semibold uppercase tracking-wider mt-2 inline-block opacity-70',
            SECTION_THEMES.testimonials.textColor,
          )}
        >
          Watch them rave about Codebuff (previously &quot;Manicode&quot;)
        </span>
      </div>

      <div className="mt-12 relative w-screen left-[50%] right-[50%] -ml-[50vw] -mr-[50vw]">
        <div className="overflow-hidden">
          {testimonials.map((row, rowIndex) => {
            const renderedRow = (
              <div
                className={cn(
                  'flex items-center gap-6 animate-marquee group-hover:[animation-play-state:paused]',
                  rowIndex % 2 === 1 && '[animation-direction:reverse]',
                )}
              >
                {row.map((testimonial, i) => (
                  <ReviewCard
                    key={i}
                    t={testimonial}
                    onTestimonialClick={handleTestimonialClick}
                  />
                ))}
              </div>
            )

            return (
              <div
                key={rowIndex}
                className={cn(
                  'flex flex-nowrap gap-6 overflow-hidden [--gap:1.5rem] hover:pause-animation group py-4',
                  '[--duration:35s]',
                )}
              >
                {renderedRow}
                {renderedRow}
              </div>
            )
          })}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        <div className="flex flex-col md:flex-row items-center justify-center md:space-x-12 space-y-8 md:space-y-0">
          <div className="flex flex-col items-center">
            <p className={SECTION_THEMES.testimonials.textColor}>Backed by</p>
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
      </div>
    </Section>
  )
}
