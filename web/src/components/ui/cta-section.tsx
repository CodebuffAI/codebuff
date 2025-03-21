'use client'

import Link from 'next/link'
import { BlockColor } from './decorative-blocks'
import { HeroButtons } from './hero-buttons'
import { useState } from 'react'
import { Section } from './section'

export function CTASection() {
  const [isHovered, setIsHovered] = useState(false)

  const decorativeColors = isHovered
    ? [BlockColor.AcidMatrix, BlockColor.GenerativeGreen, BlockColor.CRTAmber]
    : [
        BlockColor.TerminalYellow,
        BlockColor.CRTAmber,
        BlockColor.DarkForestGreen,
      ]

  return (
    <Section background="black">
      <div className="max-w-4xl mx-auto relative">
        <h2 className="text-4xl md:text-5xl font-medium mb-6 text-white relative inline-block font-serif">
          Start Buffing Your Code For Free
        </h2>
        <p className="text-lg mb-10 text-white/80 max-w-2xl mx-auto">
          No card required. Start hacking in 30 seconds. Check out the docs.
        </p>

        <HeroButtons 
          className="mb-12"
          decorativeColors={decorativeColors}
        />

        <div className="flex justify-center space-x-6 relative">
          <Link
            href="/docs"
            className="flex items-center text-white hover:text-primary transition-colors duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25"
              />
            </svg>
            <span>Documentation</span>
          </Link>
          <Link
            href="https://github.com/CodebuffAI/codebuff"
            className="flex items-center text-white hover:text-primary transition-colors duration-300"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
              className="w-5 h-5 mr-2"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0-3.09 3.09Z"
              />
            </svg>
            <span>GitHub Repo</span>
          </Link>
        </div>
      </div>
    </Section>
  )
}
