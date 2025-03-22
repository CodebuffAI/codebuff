'use client'

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { BlockColor } from './decorative-blocks'
import { DecorativeBlocks } from './decorative-blocks'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { TerminalCopyButton } from './enhanced-copy-button'

interface HeroButtonsProps {
  className?: string
  decorativeColors?: BlockColor[]
}

export function HeroButtons({
  className,
  decorativeColors = [BlockColor.TerminalYellow],
}: HeroButtonsProps) {
  const [buttonHovered, setButtonHovered] = useState(false)

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto',
        className
      )}
    >
      <DecorativeBlocks
        colors={decorativeColors}
        initialPlacement="bottom-left"
      >
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onHoverStart={() => setButtonHovered(true)}
          onHoverEnd={() => setButtonHovered(false)}
        >
          <Button
            size="lg"
            className={cn(
              'w-full md:w-[320px] text-base font-medium px-8 py-4 h-auto',
              'transition-all duration-300 relative group overflow-hidden',
              'border border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.25)] bg-white text-black'
            )}
          >
            <Link
              href="/pricing"
              className="relative z-10 flex items-center gap-2"
            >
              <span>Try Free</span>
              <motion.div
                animate={{
                  x: buttonHovered ? 4 : 0,
                }}
                transition={{ duration: 0.2 }}
              >
                <ArrowRight className="w-4 h-4" />
              </motion.div>
            </Link>
          </Button>
        </motion.div>
      </DecorativeBlocks>

      <TerminalCopyButton />
    </div>
  )
}
