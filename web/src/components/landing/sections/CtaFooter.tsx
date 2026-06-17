'use client'

import { motion } from 'framer-motion'

import { DiscordIcon, GitHubIcon } from '../icons'

const DISCORD_URL = 'https://discord.gg/yXG3w7wxfs'
const GITHUB_URL = 'https://github.com/CodebuffAI/codebuff'

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
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.6 }}
          transition={{ duration: 0.6 }}
          className="text-center font-serif text-xl text-white/90 md:text-3xl"
        >
          We just killed paid coding agents
        </motion.p>
      </div>

      {/* Wordmark closing back into the mountains (mirrors the hero opening) */}
      <div className="relative mt-10 h-[46vh] min-h-[340px] select-none md:mt-12 md:h-[56vh]">
        <h2
          aria-label="freebuff"
          className="lp-hero-heading absolute inset-x-0 bottom-[24%] z-0 bg-gradient-to-b from-white via-white/80 to-white/20 bg-clip-text text-center font-bold leading-none tracking-tight text-transparent"
          style={{ fontSize: 'clamp(3.25rem, 13vw, 11rem)' }}
        >
          freebuff
        </h2>

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/hills-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-x-0 bottom-[12%] z-[1] w-full select-none object-cover opacity-30 brightness-[0.5] saturate-[0.7]"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/landing/bushes-fg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 w-full origin-bottom scale-[1.25] select-none object-cover brightness-[0.5] saturate-[0.8]"
        />
      </div>

      {/* Ultra-minimal bottom strip */}
      <div className="relative z-20 border-t border-white/10 bg-black">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-6 sm:flex-row">
          <span className="text-xs text-white/30">© Freebuff 2026</span>
          <div className="flex items-center gap-4 text-white/40">
            <a
              href={DISCORD_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Discord"
              className="transition-colors hover:text-white"
            >
              <DiscordIcon className="h-[18px] w-[18px]" />
            </a>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="GitHub"
              className="transition-colors hover:text-white"
            >
              <GitHubIcon className="h-[18px] w-[18px]" />
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
