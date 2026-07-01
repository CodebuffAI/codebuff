'use client'

import { motion } from 'framer-motion'
import { Apple, Download, Monitor, Terminal } from 'lucide-react'
import { useEffect, useState } from 'react'

import { LandingNavbar } from '../Navbar'
import { CtaFooter } from '../sections/CtaFooter'
import { Faq } from '../sections/Faq'

type FaqItem = { q: string; a: string }

type PlatformKey = 'mac-arm64' | 'mac-intel' | 'windows' | 'linux'

type PlatformCard = {
  key: PlatformKey
  os: 'mac' | 'windows' | 'linux'
  label: string
  sublabel: string
  icon: React.ReactNode
}

const PLATFORMS: PlatformCard[] = [
  {
    key: 'mac-arm64',
    os: 'mac',
    label: 'macOS',
    sublabel: 'Apple Silicon',
    icon: <Apple className="h-5 w-5" />,
  },
  {
    key: 'mac-intel',
    os: 'mac',
    label: 'macOS',
    sublabel: 'Intel',
    icon: <Apple className="h-5 w-5" />,
  },
  {
    key: 'windows',
    os: 'windows',
    label: 'Windows',
    sublabel: '64-bit',
    icon: <Monitor className="h-5 w-5" />,
  },
  {
    key: 'linux',
    os: 'linux',
    label: 'Linux',
    sublabel: 'AppImage',
    icon: <Terminal className="h-5 w-5" />,
  },
]

const downloadHref = (key: PlatformKey) => `/api/desktop/download/${key}`

const PRIMARY_CTA_CLASS =
  'inline-flex h-12 items-center gap-2.5 rounded-full bg-white px-8 text-base font-medium text-black transition-opacity hover:opacity-90'
const SUBTLE_LINK_CLASS =
  'text-[13px] text-white/45 transition-colors hover:text-white'

/** Best-effort OS guess so we can highlight the most likely download. */
function detectOs(): PlatformCard['os'] | null {
  if (typeof navigator === 'undefined') return null
  const s = `${navigator.platform ?? ''} ${navigator.userAgent ?? ''}`
  if (/mac|iphone|ipad|ipod/i.test(s)) return 'mac'
  if (/win/i.test(s)) return 'windows'
  if (/linux|x11/i.test(s)) return 'linux'
  return null
}

export function DesktopLanding({ faqs }: { faqs: FaqItem[] }) {
  return (
    <div className="dark relative min-h-screen bg-black font-paragraph font-light text-white">
      <LandingNavbar />
      <main>
        <DesktopHero />
        <div className="relative z-10 bg-black">
          <DownloadSection />
          <Faq items={faqs} />
          <CtaFooter />
        </div>
      </main>
    </div>
  )
}

function DesktopHero() {
  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#070b11_0%,#0a1218_30%,#101f23_58%,#0a1010_82%,#000000_100%)]" />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-6 pb-24 pt-28 text-center md:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: 0.06 }}
          className="flex w-full flex-col items-center"
        >
          <span className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-forest-bright/25 bg-forest/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-forest-bright/90">
            beta
          </span>

          <h1 className="lp-hero-heading text-balance text-[34px] font-normal leading-[1.1] text-white md:text-[52px] lg:text-[58px]">
            The free coding agent{' '}
            <span className="text-forest-bright">on your desktop</span>
          </h1>

          <p className="mt-4 max-w-md text-base leading-relaxed text-white/55 md:text-[17px]">
            Run multiple coding agents in parallel, each in its own workspace.
            No subscriptions, no API keys.
          </p>

          <div className="mt-9 w-full max-w-xl">
            <PrimaryDownload />
          </div>
        </motion.div>
      </div>
    </section>
  )
}

/** OS-detected primary CTA, with a jump link to the full platform list. */
function PrimaryDownload() {
  const [os, setOs] = useState<PlatformCard['os'] | null>(null)

  useEffect(() => {
    setOs(detectOs())
  }, [])

  // The browser can't reliably tell Apple Silicon from Intel, so for macOS we
  // default the primary button to Apple Silicon (the common case) but surface
  // the Intel build right beside it — not buried in the grid below.
  const recommended = PLATFORMS.find((p) => p.os === os)
  const intelMac =
    recommended?.os === 'mac'
      ? PLATFORMS.find((p) => p.key === 'mac-intel')
      : undefined

  return (
    <div className="flex flex-col items-center gap-2.5">
      {recommended ? (
        <a href={downloadHref(recommended.key)} className={PRIMARY_CTA_CLASS}>
          <Download className="h-4 w-4" />
          Download for {recommended.label}
          <span className="text-black/50">·</span>
          <span className="text-sm text-black/55">{recommended.sublabel}</span>
        </a>
      ) : (
        <a href="#downloads" className={PRIMARY_CTA_CLASS}>
          <Download className="h-4 w-4" />
          Download Freebuff Desktop
        </a>
      )}
      {intelMac && (
        <a href={downloadHref(intelMac.key)} className={SUBTLE_LINK_CLASS}>
          On an Intel Mac? Get the Intel build
        </a>
      )}
      <a href="#downloads" className={SUBTLE_LINK_CLASS}>
        All platforms
      </a>
    </div>
  )
}

function DownloadSection() {
  return (
    <section id="downloads" className="relative bg-black px-6 py-24 md:py-28">
      <div className="mx-auto max-w-5xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-forest-bright/90">
            Download
          </p>
          <h2 className="lp-feature-heading text-white">
            Pick your platform
          </h2>
          <p className="mt-4 text-base leading-relaxed text-white/55">
            Download the installer, sign in with GitHub or Google, and start
            building — free models included.
          </p>
        </div>

        <div className="mx-auto mt-14 grid max-w-3xl grid-cols-1 gap-3 sm:grid-cols-2">
          {PLATFORMS.map((p, i) => (
            <motion.a
              key={p.key}
              href={downloadHref(p.key)}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 transition-colors hover:border-forest/40 hover:bg-white/[0.05]"
            >
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors group-hover:text-forest-bright">
                {p.icon}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-normal text-white/90">
                  {p.label}
                </span>
                <span className="block text-sm text-white/45">
                  {p.sublabel}
                </span>
              </span>
              <Download className="h-4 w-4 shrink-0 text-white/30 transition-colors group-hover:text-white" />
            </motion.a>
          ))}
        </div>

        <p className="mx-auto mt-8 max-w-2xl text-center text-[13px] leading-relaxed text-white/40">
          These beta builds aren&apos;t code-signed yet. On macOS, right-click
          the app and choose <span className="text-white/60">Open</span> (or
          allow it in System Settings → Privacy &amp; Security); on Windows,
          click <span className="text-white/60">More info → Run anyway</span> if
          SmartScreen appears.
        </p>
      </div>
    </section>
  )
}
