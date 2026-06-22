'use client'

import { motion } from 'framer-motion'

import { NavSocialLinks } from '../NavSocialLinks'
import { GitHubStarLink } from '../GitHubStarLink'
import { Parallax } from '../Parallax'
import { TooltipProvider } from '@/vly/components/ui/tooltip'

// Real platform routes (verified against the freebuff/web app router).
const NAV_LINKS = [
  { text: 'CLI', href: '/cli' },
  { text: 'Web', href: '/web' },
  { text: 'Chat', href: '/chat' },
  { text: 'Blog', href: '/blog' },
  { text: 'Live', href: '/live' },
  { text: 'Pricing', href: '/web/pricing' },
]
// Legal lives on codebuff.com (mirrors the site-wide footer).
const LEGAL_LINKS = [
  { text: 'Privacy Policy', href: 'https://codebuff.com/privacy-policy' },
  { text: 'Terms of Service', href: 'https://codebuff.com/terms-of-service' },
]

/**
 * Closing footer that mirrors the hero in reverse: the night sky returns and
 * the mountains rise back up to swallow the wordmark, bookending the page.
 * No green glow, no CTA — just one line of copy.
 */
export function CtaFooter() {
  return (
    <section className="relative overflow-hidden bg-black">
      {/* Night sky returning — same cool tone the hero opens on, no green */}
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#000000_0%,#04070c_42%,#080d16_72%,#0b1422_100%)]" />

      <div className="relative z-20 mx-auto max-w-6xl px-6 pt-24 md:pt-32">
        <Parallax from={-50} to={30}>
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.6 }}
            transition={{ duration: 0.6 }}
            className="text-center lp-serif text-xl text-white/90 md:text-3xl"
          >
            We just killed paid coding agents
          </motion.p>
        </Parallax>
      </div>

      {/*
        Wordmark closing back into the mountains (mirrors the hero opening).

        Robustness note: the wordmark, the bushes and the font size are all
        sized off viewport *width* (vw / the font clamp), so their relationship
        stays constant as the viewport gets wider or narrower. The treeline
        offsets are deliberately *not* tied to the container's `vh` height —
        otherwise short or very wide viewports either drop the wordmark too low
        (container hits its `min-h`) or let the bushes balloon past it, burying
        the letters. The image heights are clamped so they crop (object-bottom)
        instead of growing without bound on ultrawide screens.
      */}
      <div className="relative mt-10 h-[46vh] min-h-[360px] select-none md:mt-12 md:h-[56vh]">
        <Parallax
          from={70}
          to={-40}
          className="absolute inset-x-0 bottom-[clamp(64px,calc(10vw-30px),240px)] z-0"
        >
          <h2
            aria-label="freebuff"
            className="lp-hero-heading bg-gradient-to-b from-white via-white/80 to-white/20 bg-clip-text text-center font-medium leading-none tracking-tight text-transparent"
            style={{ fontSize: 'clamp(3.25rem, 13vw, 11rem)' }}
          >
            freebuff
          </h2>
        </Parallax>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/hills-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-x-0 bottom-[8%] z-[1] h-[clamp(150px,26vw,380px)] w-full select-none object-cover object-bottom opacity-30 brightness-[0.5] saturate-[0.7]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/bushes-fg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-[clamp(130px,22vw,440px)] w-full origin-bottom select-none object-cover object-bottom brightness-[0.5] saturate-[0.8]"
        />
      </div>

      {/* Minimal bottom strip — real platform links + legal + socials */}
      <div className="relative z-20 border-t border-white/10 bg-black">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-7 md:flex-row md:items-center md:justify-between">
          {/* Links: product + legal */}
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-white/45">
            {[...NAV_LINKS, ...LEGAL_LINKS].map((link) => {
              const external = link.href.startsWith('http')
              return (
                <a
                  key={link.href}
                  href={link.href}
                  {...(external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="transition-colors hover:text-white"
                >
                  {link.text}
                </a>
              )
            })}
          </nav>

          {/* Copyright + socials */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/30">
              © {new Date().getFullYear()} Freebuff. All rights reserved.
            </span>
            <span className="h-4 w-px bg-white/10" />
            <TooltipProvider delayDuration={200}>
              <div className="flex items-center gap-3">
                <NavSocialLinks />
                <GitHubStarLink />
              </div>
            </TooltipProvider>
          </div>
        </div>
      </div>
    </section>
  )
}
