import { motion, useScroll, useTransform } from 'framer-motion'
import { useRef, useState } from 'react'

import { CostBarChart } from '@/components/hero/CostBarChart'
import { HeroTabs } from '@/components/hero/HeroTabs'
import { Starfield } from '@/components/Starfield'
import type { TabId } from '@/lib/competitors'

/**
 * Hero with a layered parallax scene. The page scrolls NATURALLY — nothing is
 * pinned. The only scroll-linked motion is the relative drift between the
 * background layers, the cost chart, and the foreground bushes.
 */
export function Hero() {
  const sceneRef = useRef<HTMLDivElement>(null)
  const [tab, setTab] = useState<TabId>('cli')

  const { scrollYProgress } = useScroll({
    target: sceneRef,
    offset: ['start end', 'end start'],
  })

  // Big positive values = very slow (scene travels ~180vh over progress 0→1).
  const starsY = useTransform(scrollYProgress, [0, 1], ['0vh', '150vh'])
  const skyY = useTransform(scrollYProgress, [0, 1], ['0vh', '95vh'])
  const hillsY = useTransform(scrollYProgress, [0, 1], ['0vh', '34vh'])
  // Chart drifts slowly and sits high so it's visible immediately, then the
  // foreground bushes rise over its base as you scroll (z-10 < bushes z-20).
  const chartY = useTransform(scrollYProgress, [0, 1], ['0vh', '14vh'])
  const bushesY = useTransform(scrollYProgress, [0, 1], ['0vh', '-52vh'])

  return (
    <section className="relative isolate overflow-hidden">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_bottom,#070b11_0%,#0a1218_24%,#101f23_44%,#172a29_57%,#121a1a_71%,#070a0b_86%,#000000_100%)]" />
      <motion.div
        style={{ y: starsY }}
        className="gpu pointer-events-none absolute inset-0"
      >
        <Starfield />
      </motion.div>
      {/* ── Hero copy + tabs (natural flow) ── */}
      <div className="relative z-30 mx-auto flex max-w-3xl flex-col items-center px-6 pt-28 text-center md:pt-32">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: 'easeOut' }}
          className="flex w-full flex-col items-center"
        >
          {/* usage count */}
          <div className="mb-6 flex items-center gap-2 text-sm text-white/55">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-forest-bright opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-forest-bright" />
            </span>
            <span>
              <span className="font-medium text-white/85">230,000+</span>{' '}
              developers coding for free
            </span>
          </div>

          <h1 className="hero-heading text-balance text-[34px] font-normal leading-[1.1] text-white md:text-[52px] lg:text-[58px]">
            We make coding{' '}
            <span className="text-forest-bright">100% free</span>
          </h1>

          <p className="mt-4 max-w-md text-base leading-relaxed text-white/55 md:text-[17px]">
            No subscriptions. No API keys. Start in seconds.
          </p>

          <div className="mt-9 w-full">
            <HeroTabs tab={tab} onTab={setTab} />
          </div>
        </motion.div>
      </div>

      {/* ── Parallax scene: distant range · hills · cost chart · bushes ── */}
      <div
        ref={sceneRef}
        className="relative -mt-12 h-[108vh] w-full md:-mt-16 md:h-[118vh]"
      >
        <motion.img
          src="/sky-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          style={{ y: skyY }}
          className="gpu pointer-events-none absolute inset-x-0 bottom-[32%] z-0 w-full select-none object-cover opacity-[0.44] brightness-[0.7] saturate-[0.8]"
        />

        <motion.img
          src="/hills-bg.webp"
          alt=""
          aria-hidden
          decoding="async"
          draggable={false}
          style={{ y: hillsY }}
          className="gpu pointer-events-none absolute inset-x-0 bottom-[21%] z-[1] w-full select-none object-cover brightness-[1.15] contrast-[1.05]"
        />

        {/* Cost comparison chart — sits high so it's visible right away; its
            tall base runs down behind the bushes, which rise to cover it as
            you scroll (z-10 < bushes z-20). */}
        <motion.div
          style={{ y: chartY }}
          className="gpu absolute inset-x-0 top-[11%] z-10 mx-auto w-full max-w-4xl px-3 sm:px-6"
        >
          <CostBarChart tab={tab} />
        </motion.div>

        {/* Foreground bushes + welded black floor mask */}
        <motion.div
          style={{ y: bushesY }}
          className="gpu pointer-events-none absolute inset-x-0 bottom-0 z-20"
        >
          <img
            src="/bushes-fg.webp"
            alt=""
            aria-hidden
            decoding="async"
            draggable={false}
            className="block w-full origin-bottom scale-[1.3] select-none object-cover brightness-[0.62] saturate-[0.85]"
          />
          {/* Long, gentle fade that dissolves the bushes into black. It reaches
              solid black at ~78% and stays black to the bottom, giving a tall
              fully-black tail. The floor is welded as a PERCENTAGE (84%) so it
              always lands inside that black tail — at any viewport width the
              bushes image scales but the alignment holds, so there's never a
              hard floor edge poking through the fade. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-full bg-[linear-gradient(to_bottom,transparent_0%,rgba(0,0,0,0.12)_30%,rgba(0,0,0,0.45)_50%,rgba(0,0,0,0.8)_66%,#000_78%)]" />
          <div className="absolute inset-x-0 top-[84%] h-[180vh] bg-black" />
        </motion.div>
      </div>
    </section>
  )
}
