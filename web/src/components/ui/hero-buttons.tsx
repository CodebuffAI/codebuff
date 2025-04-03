'use client'

import { ArrowRight } from 'lucide-react'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { TerminalCopyButton } from './enhanced-copy-button'
import { useInstallDialog } from '@/hooks/use-install-dialog'
import posthog from 'posthog-js'

interface HeroButtonsProps {
  className?: string
}

export function HeroButtons({ className }: HeroButtonsProps) {
  const [buttonHovered, setButtonHovered] = useState(false)
  const { open: openInstallDialog } = useInstallDialog()

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
      <div
        className="relative w-full md:w-auto"
        onMouseEnter={() => setButtonHovered(true)}
        onMouseLeave={() => setButtonHovered(false)}
      >
        <div className="absolute inset-0 bg-[rgb(143,228,87)] -translate-x-1 translate-y-1" />
        
        <motion.div
          animate={{
            x: buttonHovered ? 2 : 0,
            y: buttonHovered ? -2 : 0,
          }}
          transition={{ duration: 0.2 }}
        >
          <Button
            size="lg"
            className={cn(
              'relative w-full',
              'px-8 py-4 h-auto text-base font-medium',
              'bg-white text-black hover:bg-white',
              'border border-white/50',
              'transition-all duration-300'
            )}
            onClick={handleTryFreeClick}
          >
            <div className="flex items-center gap-2">
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
      </div>

      <TerminalCopyButton className="h-[56px]" />
    </div>
  )
}
