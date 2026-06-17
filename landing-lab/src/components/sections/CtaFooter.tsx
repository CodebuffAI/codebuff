import { motion } from 'framer-motion'

import { DiscordIcon, GitHubIcon } from '@/components/icons'

const DISCORD_URL = 'https://discord.gg/yXG3w7wxfs'
const GITHUB_URL = 'https://github.com/CodebuffAI/codebuff'

// Real platform links, mirrored from the site-wide footer.
const NAV_LINKS = [
  { text: 'Docs', href: '/docs' },
  { text: 'Pricing', href: '/pricing' },
  { text: 'Usage', href: '/usage' },
]
const LEGAL_LINKS = [
  { text: 'Privacy Policy', href: '/privacy-policy' },
  { text: 'Terms of Service', href: '/terms-of-service' },
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
          className="hero-heading absolute inset-x-0 bottom-[24%] z-0 bg-gradient-to-b from-white via-white/80 to-white/20 bg-clip-text text-center font-medium leading-none tracking-tight text-transparent"
          style={{ fontSize: 'clamp(3.25rem, 13vw, 11rem)' }}
        >
          freebuff
        </h2>

        <img
          src="/hills-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-x-0 bottom-[12%] z-[1] w-full select-none object-cover opacity-30 brightness-[0.5] saturate-[0.7]"
        />
        <img
          src="/bushes-fg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          className="pointer-events-none absolute inset-x-0 bottom-0 z-10 w-full origin-bottom scale-[1.25] select-none object-cover brightness-[0.5] saturate-[0.8]"
        />
      </div>

      {/* Minimal bottom strip — real platform links + legal + socials */}
      <div className="relative z-20 border-t border-white/10 bg-black">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-5 px-6 py-7 md:flex-row md:items-center md:justify-between">
          {/* Links: product + legal */}
          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-[13px] text-white/45">
            {[...NAV_LINKS, ...LEGAL_LINKS].map((link) => (
              <a
                key={link.href}
                href={link.href}
                className="transition-colors hover:text-white"
              >
                {link.text}
              </a>
            ))}
          </nav>

          {/* Copyright + socials */}
          <div className="flex items-center gap-4">
            <span className="text-xs text-white/30">
              © {new Date().getFullYear()} Freebuff. All rights reserved.
            </span>
            <span className="h-4 w-px bg-white/10" />
            <div className="flex items-center gap-3 text-white/40">
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
      </div>
    </section>
  )
}
