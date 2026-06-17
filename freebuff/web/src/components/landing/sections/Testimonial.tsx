import { Star } from 'lucide-react'

const STAR_GREEN = '#2c7a40'

/**
 * A single, attention-grabbing testimonial: a centered life-changing quote
 * with a Trustpilot-style 5-star rating and a "1K+" rating count below it.
 */
export function Testimonial() {
  return (
    <section className="relative bg-black px-6 pt-24 pb-12 md:pt-32 md:pb-16">
      <figure className="mx-auto max-w-3xl text-center">
        <blockquote className="lp-serif text-balance text-[26px] italic leading-[1.3] text-white md:text-[38px] lg:text-[44px]">
          &ldquo;Proving life-changing in making a dream of mine come true&rdquo;
        </blockquote>
        <figcaption className="mt-7 text-sm tracking-wide text-white/55">
          &mdash;&nbsp;Mia Cova
        </figcaption>

        <div className="mt-7 flex items-center justify-center gap-3">
          <div className="flex items-center gap-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <span
                key={i}
                className="flex h-7 w-7 items-center justify-center rounded-[3px]"
                style={{ background: STAR_GREEN }}
              >
                <Star className="h-4 w-4 text-white" fill="currentColor" strokeWidth={0} />
              </span>
            ))}
          </div>
          <span className="text-sm font-normal tabular-nums text-white/70">1K+</span>
        </div>
      </figure>
    </section>
  )
}
