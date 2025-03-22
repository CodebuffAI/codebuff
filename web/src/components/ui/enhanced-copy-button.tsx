'use client'

import { useState } from 'react'
import { Copy, Check, Terminal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

interface EnhancedCopyButtonProps {
  value: string
  className?: string
}

export function EnhancedCopyButton({
  value,
  className,
}: EnhancedCopyButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)

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
      className={cn(
        'flex items-center justify-center p-2 rounded-md',
        'text-white/60 hover:text-white',
        'hover:bg-white/5 focus:outline-none',
        'transition-colors duration-200',
        className
      )}
      onClick={handleCopy}
      whileTap={{ scale: 0.95 }}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-green-400 flex items-center"
        >
          <Check size={16} />
        </motion.div>
      ) : (
        <Copy size={16} />
      )}
    </motion.button>
  )
}

interface TerminalCopyButtonProps {
  className?: string
  onClick?: () => void
}

export function TerminalCopyButton({ className, onClick }: TerminalCopyButtonProps) {
  const [installClicked, setInstallClicked] = useState(false)

  const handleClick = () => {
    setInstallClicked(true)
    onClick?.()
  }

  return (
    <motion.div
      className={cn("w-full md:w-auto md:min-w-[320px] relative", className)}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={handleClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
    >
      <div
        className={cn(
          'bg-zinc-800/60 border border-zinc-700/50 rounded-md px-3 py-2.5',
          'flex items-center justify-between overflow-hidden group relative',
          'hover:border-green-500/30 hover:shadow-[0_0_15px_rgba(74,222,128,0.15)]',
          'transition-all duration-300'
        )}
      >
        <div className="flex items-center space-x-2">
          <Terminal size={16} className="text-green-400" />
          <code className="font-mono text-white/90 text-sm select-all">
            npm install -g codebuff
          </code>
        </div>
        <EnhancedCopyButton
          value="npm install -g codebuff"
          className="ml-2"
        />
      </div>
    </motion.div>
  )
}