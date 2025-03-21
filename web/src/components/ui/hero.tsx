'use client'

import { BlockColor } from './decorative-blocks'
import { HeroButtons } from './hero-buttons'
import { Section } from './section'

export function Hero() {
  return (
    <Section hero>
      <h1 className="hero-heading text-center mb-8 text-white text-balance">
        <span className="relative inline-block">
          <span className="relative z-10">Revolutionize</span>
        </span>{' '}
        Your{' '}
        <span className="relative inline-block">
          <span className="relative z-10">Codeflow</span>
        </span>
      </h1>

      <p className="hero-subtext mb-14 text-center">
        Codebuff is the smartest AI partner. In the terminal or your favorite
        IDE,
        <br className="hidden md:block" />
        it works where you work and knows your entire stack.
      </p>

      <HeroButtons />
    </Section>
  )
}
