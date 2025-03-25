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
import { Dialog, DialogContent } from './dialog'
import { CodeDemo } from '../docs/mdx/code-demo'
import { useInstallDialog } from '@/hooks/use-install-dialog'
import posthog from 'posthog-js'

interface HeroButtonsProps {
  className?: string
  decorativeColors?: BlockColor[]
}

export function HeroButtons({
  className,
  decorativeColors = [BlockColor.TerminalYellow],
}: HeroButtonsProps) {
  const [buttonHovered, setButtonHovered] = useState(false)
  const {
    isOpen: isInstallOpen,
    open: openInstallDialog,
    close: closeInstallDialog,
  } = useInstallDialog()

  const handleTryFreeClick = () => {
    posthog.capture('home.try_free_clicked')
    openInstallDialog()
  }

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto',
        className
      )}
    >
      <DecorativeBlocks colors={decorativeColors} placement="bottom-left">
        <motion.div
          whileHover={{ x: 4, y: -4 }}
          whileTap={{ x: 0, y: 0 }}
          onHoverStart={() => setButtonHovered(true)}
          onHoverEnd={() => setButtonHovered(false)}
        >
          <Button
            size="lg"
            className={cn(
              'w-full md:w-[320px] text-base font-medium px-8 py-4 h-auto',
              'transition-all duration-300 relative group overflow-hidden',
              'border border-white/50 bg-white text-black hover:bg-white'
            )}
            onClick={handleTryFreeClick}
          >
            <div className="relative z-10 flex items-center gap-2">
              <span>Try Free</span>
              <motion.div
                animate={{
                  x: buttonHovered ? 4 : 0,
                }}
                transition={{ duration: 0.2 }}
              >
                <ArrowRight className="w-4 h-4" />
              </motion.div>
            </div>
          </Button>
        </motion.div>
      </DecorativeBlocks>

      <TerminalCopyButton className="h-[56px]" />
    </div>
  )
}
