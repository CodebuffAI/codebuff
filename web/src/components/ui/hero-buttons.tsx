import { motion } from 'framer-motion'
import posthog from 'posthog-js'
import { useState } from 'react'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { Button } from './button'
import { TerminalCopyButton } from './enhanced-copy-button'

import { useInstallDialog } from '@/hooks/use-install-dialog'
import { cn } from '@/lib/utils'

interface HeroButtonsProps {
  className?: string
}

export function HeroButtons({ className }: HeroButtonsProps) {
  const [buttonHovered, setButtonHovered] = useState(false)
  const { open: openInstallDialog } = useInstallDialog()

  const handleTryFreeClick = () => {
    posthog.capture(AnalyticsEvent.HOME_TRY_FREE_CLICKED)
    openInstallDialog()
  }

  return (
    <div
      className={cn(
        'flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto',
        className,
      )}
    >
      <div
        className="relative w-full md:w-auto"
        onMouseEnter={() => setButtonHovered(true)}
        onMouseLeave={() => setButtonHovered(false)}
      >
        <div className="absolute inset-0 bg-[rgb(143,228,87)] -translate-x-1 translate-y-1 rounded-md" />

        <motion.div
          animate={{
            x: buttonHovered ? 2 : 0,
            y: buttonHovered ? -2 : 0,
          }}
          transition={{ duration: 0.2 }}
          className="relative"
        >
          <Button
            size="lg"
            className={cn(
              'relative w-full',
              'px-8 py-4 h-auto text-base font-medium',
              'bg-white text-black hover:bg-white',
              'transition-all duration-300',
            )}
            onClick={handleTryFreeClick}
            aria-label="Get Started"
          >
            <span>Get Started</span>
          </Button>
        </motion.div>
      </div>

      <TerminalCopyButton className="h-[56px]" />
    </div>
  )
}
