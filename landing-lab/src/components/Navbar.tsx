import { motion, useScroll, useTransform } from 'framer-motion'

import { DiscordIcon, GitHubIcon } from '@/components/icons'

const LINKS = [
  { label: 'Web', href: '#web' },
  { label: 'Chat', href: '#chat' },
  { label: 'Blog', href: '#blog' },
]

const DISCORD_URL = 'https://discord.gg/yXG3w7wxfs'
const GITHUB_URL = 'https://github.com/CodebuffAI/codebuff'

/**
 * Scrubs with scroll position so it compacts on the way down and restores on
 * the way back up. PERF: every scroll-linked property here is transform/opacity
 * only (x, y, scale, opacity) — no padding/width/blur — so it stays on the
 * compositor and never triggers layout or expensive repaints while scrolling.
 */
export function Navbar() {
  const { scrollY } = useScroll()

  const y = useTransform(scrollY, [0, 90], [0, -7])
  const scale = useTransform(scrollY, [0, 90], [1, 0.9])
  const bgOpacity = useTransform(scrollY, [0, 90], [0, 1])

  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="fixed inset-x-0 top-0 z-50"
    >
      {/* Shadow gradient mask only — no blur/glass, no border */}
      <motion.div
        aria-hidden
        style={{ opacity: bgOpacity }}
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/90 via-black/55 to-transparent"
      />

      <motion.div
        style={{ y }}
        className="relative mx-auto flex max-w-6xl items-center justify-between px-6 py-4 sm:px-10 lg:px-12"
      >
        {/* Logo — sparkle mark + wordmark */}
        <motion.a
          href="#"
          style={{ scale }}
          className="group flex origin-left items-center gap-2.5"
        >
          <img
            src="/freebuff-mark.svg"
            alt="Freebuff"
            className="h-6 w-6 rounded-[5px]"
          />
          <span className="font-serif text-lg tracking-wide text-white/85 transition-colors group-hover:text-white">
            freebuff
          </span>
        </motion.a>

        {/* Right cluster: text links · divider · social icons */}
        <motion.div
          style={{ scale }}
          className="flex origin-right items-center gap-1 sm:gap-2"
        >
          <nav className="hidden items-center sm:flex">
            {LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="rounded-md px-3 py-2 text-sm text-white/55 transition-colors hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <span className="mx-1 hidden h-4 w-px bg-white/15 sm:block" />

          <a
            href={DISCORD_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Discord"
            className="flex items-center rounded-md p-2 text-white/50 transition-colors hover:text-white"
          >
            <DiscordIcon className="h-[18px] w-[18px]" />
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="flex items-center rounded-md p-2 text-white/50 transition-colors hover:text-white"
          >
            <GitHubIcon className="h-[18px] w-[18px]" />
          </a>
        </motion.div>
      </motion.div>
    </motion.header>
  )
}
