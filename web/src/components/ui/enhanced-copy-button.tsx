'use client'

import { motion } from 'framer-motion'
import { Check, Copy, Terminal } from 'lucide-react'
import posthog from 'posthog-js'
import { forwardRef, useState } from 'react'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'

import { BlockColor } from './decorative-blocks'

import { cn } from '@/lib/utils'

interface EnhancedCopyButtonProps {
  value: string
  className?: string
  onClick?: () => void
}

export const EnhancedCopyButton = forwardRef<
  HTMLButtonElement,
  EnhancedCopyButtonProps
>(({ value, className, onClick }, ref) => {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      onClick?.()

      // Reset after 2 seconds
      setTimeout(() => {
        setCopied(false)
      }, 2000)
    } catch (err) {
      console.error('Failed to copy: ', err)
    }
  }

  return (
    <motion.button
      ref={ref}
      className={cn(
        'flex items-center justify-center p-2 rounded-md',
        'text-white/60 hover:text-white',
        'hover:bg-white/5 focus:outline-none',
        'transition-colors duration-200',
        className,
      )}
      onClick={handleCopy}
      whileTap={{ scale: 0.95 }}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{ color: BlockColor.AcidMatrix }}
          className="flex items-center"
        >
          <Check size={16} />
        </motion.div>
      ) : (
        <Copy size={16} />
      )}
    </motion.button>
  )
})

EnhancedCopyButton.displayName = 'EnhancedCopyButton'

interface TerminalCopyButtonProps {
  className?: string
}

export function TerminalCopyButton({
  className,
  size = 'default',
  pulseBorder = false,
}: TerminalCopyButtonProps & {
  size?: 'default' | 'large'
  pulseBorder?: boolean
}) {
  const handleClick = () => {
    posthog.capture(AnalyticsEvent.HOME_INSTALL_COMMAND_COPIED)
  }

  return (
    <motion.div
      className={cn(
        'w-full md:w-auto md:min-w-[320px] relative',
        size === 'large' && 'md:min-w-[380px]',
        className,
      )}
      style={{
        ...(size === 'large' ? { height: '56px' } : {}),
        ...(className?.includes('h-[56px]') ? { height: '56px' } : {}),
      }}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    >
      <div
        style={
          {
            '--acid-matrix-shadow': `0 0 15px ${BlockColor.AcidMatrix}40`,
          } as React.CSSProperties
        }
        className={cn(
          'bg-zinc-800/60 border rounded-md overflow-hidden group relative',
          size === 'default' ? 'px-3 py-2.5' : 'px-3 py-4',
          pulseBorder
            ? `border-[${BlockColor.AcidMatrix}80]`
            : `border-zinc-700/50 hover:border-[${BlockColor.AcidMatrix}50] hover:shadow-[var(--acid-matrix-shadow)]`,
          'flex items-center justify-between h-full',
          'transition-all duration-300',
        )}
      >
        <div className="flex items-center space-x-2">
          <Terminal
            size={size === 'default' ? 16 : 20}
            style={{ color: BlockColor.AcidMatrix }}
          />
          <code
            className={cn(
              'font-mono text-white/90 select-all',
              size === 'default' ? 'text-sm' : 'text-base',
            )}
            style={{ fontFamily: '"DM Mono", var(--font-mono), monospace' }}
          >
            npm install -g codebuff
          </code>
        </div>
        <EnhancedCopyButton value="npm install -g codebuff" className="ml-2" />
      </div>
      {pulseBorder && (
        <span
          style={{ borderColor: `${BlockColor.AcidMatrix}80` }}
          className="absolute inset-0 border rounded-md animate-pulse-border pointer-events-none"
        ></span>
      )}
    </motion.div>
  )
}
