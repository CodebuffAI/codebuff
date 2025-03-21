'use client'

import Link from 'next/link'
import { Button } from './button'
import { Terminal, ArrowRight, Copy, Check } from 'lucide-react'
import { BlockColor } from './decorative-blocks'
import { InputWithCopyButton } from './input-with-copy'
import { DecorativeBlocks } from './decorative-blocks'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'

interface HeroButtonsProps {
  className?: string
  decorativeColors?: BlockColor[]
}

// Enhanced copy button with animation and feedback
function EnhancedCopyButton({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
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
        "flex items-center justify-center p-2 rounded-md",
        "text-white/60 hover:text-white",
        "hover:bg-white/5 focus:outline-none",
        "transition-colors duration-200",
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
          <span className="ml-1 text-xs">Copied!</span>
        </motion.div>
      ) : (
        <Copy size={16} />
      )}
    </motion.button>
  )
}

export function HeroButtons({ 
  className,
  decorativeColors = [BlockColor.TerminalYellow]
}: HeroButtonsProps) {
  const [buttonHovered, setButtonHovered] = useState(false)
  const [installClicked, setInstallClicked] = useState(false)
  
  // Auto-reset the installation click state
  useEffect(() => {
    if (installClicked) {
      const timer = setTimeout(() => {
        setInstallClicked(false)
      }, 2000)
      
      return () => clearTimeout(timer)
    }
  }, [installClicked])
  
  return (
    <div className={cn(
      "flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto",
      className
    )}>
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
              "w-full md:w-[320px] text-base font-medium px-8 py-4 h-auto",
              "transition-all duration-300 relative group overflow-hidden",
              "border border-green-500/50 shadow-[0_0_15px_rgba(74,222,128,0.25)]"
            )}
          >
            <Link href="/pricing" className="relative z-10 flex items-center gap-2">
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
            
            {/* Animated background gradient */}
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-green-600/80 to-green-400/80"
              animate={{
                scale: buttonHovered ? 1.15 : 1,
              }}
              transition={{ duration: 0.3 }}
            />
          </Button>
        </motion.div>
      </DecorativeBlocks>
      
      <motion.div
        className="w-full md:w-auto md:min-w-[320px] relative"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setInstallClicked(true)}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.2 }}
      >
        <div className={cn(
          "bg-zinc-800/60 border border-zinc-700/50 rounded-md px-3 py-2.5",
          "flex items-center justify-between overflow-hidden group relative",
          "hover:border-green-500/30 hover:shadow-[0_0_15px_rgba(74,222,128,0.15)]",
          "transition-all duration-300"
        )}>
          <div className="flex items-center space-x-2">
            <Terminal size={16} className="text-green-400" />
            <code className="font-mono text-white/90 text-sm select-all">npm install -g codebuff</code>
          </div>
          
          <EnhancedCopyButton 
            value="npm install -g codebuff"
            className="ml-2"
          />
          
          {/* Installation animation */}
          {installClicked && (
            <motion.div 
              className="absolute inset-0 bg-gradient-to-r from-green-600/20 to-green-400/20 flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div 
                className="flex items-center text-green-400"
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.2 }}
              >
                <Check className="mr-2" />
                <span className="font-medium">Installing...</span>
              </motion.div>
            </motion.div>
          )}
        </div>
        
        {/* Subtle hint text */}
        <motion.div 
          className="text-center text-xs text-white/40 mt-1"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
        >
          One command, global installation
        </motion.div>
      </motion.div>
    </div>
  )
}