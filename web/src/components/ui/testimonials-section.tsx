import Image from 'next/image'
import { YellowSplash, ColorBar } from './decorative-splash'
import { Testimonial, testimonials } from '@/lib/testimonials'
import { cn } from '@/lib/utils'
import { ExternalLink } from 'lucide-react'
import Marquee from './marquee'

interface TestimonialProps {
  name: string
  role: string
  quote: string
  avatarUrl: string
}

function TestimonialCard({ name, role, quote, avatarUrl }: TestimonialProps) {
  return (
    <div className="bg-[#ffff33]/70 p-6 rounded-lg transform transition-all duration-300 hover:translate-y-[-5px] hover:shadow-lg relative group">
      <div className="absolute inset-0 bg-black/5 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-lg"></div>
      <div className="flex items-center mb-4 relative z-10">
        <div className="w-12 h-12 relative mr-3 rounded-full overflow-hidden border-2 border-black/10">
          <Image src={avatarUrl} alt={name} fill className="object-cover" />
        </div>
        <div>
          <h3 className="font-medium text-black">{name}</h3>
          <p className="text-sm text-black/70">{role}</p>
        </div>
      </div>
      <p className="text-black/80 relative z-10">"{quote}"</p>
      <div className="absolute bottom-0 right-0 w-8 h-8 bg-[#ffff33] rounded-tl-xl"></div>
    </div>
  )
}

export function TestimonialsSection() {
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
          'relative w-64 lg:w-80 cursor-pointer overflow-hidden rounded-xl p-6',
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
              <p className="text-xs font-medium dark:text-white/40">
                {t.title}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExternalLink
              className="h-4 w-4"
              onClick={() => onTestimonialClick(t.author, t.link)}
            />
          </div>
        </div>
        <blockquote className="mt-4 text-sm lg:text-base">{t.quote}</blockquote>
      </figure>
    )
  }

  return (
    <section className="py-24 bg-[#ffff33] relative overflow-hidden">
      {/* Decorative elements */}
      <YellowSplash className="top-20 left-20 opacity-70" />
      <YellowSplash className="bottom-20 right-20 opacity-50" />
      <ColorBar
        color="yellow"
        width={150}
        className="absolute top-12 right-24 opacity-80 rotate-12 hidden md:block"
      />
      <ColorBar
        color="yellow"
        width={180}
        className="absolute bottom-16 left-10 opacity-80 -rotate-12 hidden md:block"
      />

      <div className="codebuff-container relative z-10">
        <h6 className="text-center text-gray-700 dark:text-gray-300 text-sm mb-12">
          (note: some testimonials reference our previous name,
          &quot;Manicode&quot; – they refer to the same product)
        </h6>
        <div className="mt-12 space-y-1">
          {testimonials.map((row, rowIndex) => (
            <Marquee
              key={rowIndex}
              className="py-6"
              pauseOnHover
              reverse={rowIndex % 2 === 1}
            >
              <div className="flex gap-6">
                {row.map((testimonial, i) => (
                  <ReviewCard
                    key={i}
                    t={testimonial}
                    onTestimonialClick={(author: string, link: string) => {
                      posthog.capture('home.testimonial_clicked', {
                        author,
                        link,
                      })
                      window.open(link)
                    }}
                  />
                ))}
              </div>
            </Marquee>
          ))}
        </div>
      </div>
    </section>
  )
}
