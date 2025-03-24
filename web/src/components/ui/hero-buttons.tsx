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

interface HeroButtonsProps {
  className?: string
  decorativeColors?: BlockColor[]
}

export function HeroButtons({
  className,
  decorativeColors = [BlockColor.TerminalYellow],
}: HeroButtonsProps) {
  const [buttonHovered, setButtonHovered] = useState(false)
  const [isInstallOpen, setIsInstallOpen] = useState(false)

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
              'border border-white/50 shadow-[0_0_15px_rgba(255,255,255,0.25)] bg-white text-black hover:bg-white'
            )}
            onClick={() => setIsInstallOpen(true)}
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

      {/* Dialogs */}
      <Dialog open={isInstallOpen} onOpenChange={setIsInstallOpen}>
        <DialogContent className="px-8 sm:px-10">
          <div className="space-y-8">
            <h2 className="text-2xl font-bold">Get Started with Codebuff</h2>
            <ol className="list-decimal list-inside space-y-8">
              <li className="text-lg leading-relaxed">
                Open your favorite terminal.
              </li>
              <li className="text-lg leading-relaxed">
                Install Codebuff globally via{' '}
                <Link
                  href="https://www.npmjs.com/package/codebuff"
                  target="_blank"
                  className="text-blue-500 hover:text-blue-400 underline"
                >
                  npm
                </Link>
                :
                <div className="mt-3">
                  <CodeDemo language="bash">npm install -g codebuff</CodeDemo>
                </div>
              </li>
              <li className="text-lg leading-relaxed">
                Run Codebuff in a project directory:
                <div className="mt-3">
                  <CodeDemo language="bash">codebuff</CodeDemo>
                </div>
              </li>
            </ol>
          </div>
        </DialogContent>
      </Dialog>

      <TerminalCopyButton />
    </div>
  )
}
