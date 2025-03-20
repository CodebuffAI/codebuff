'use client'

import Link from 'next/link'
import { Button } from './button'
import { Terminal } from 'lucide-react'
import { BlockColor } from './decorative-blocks'
import { InputWithCopyButton } from './input-with-copy'
import { DecorativeBlocks } from './decorative-blocks'
import { useState } from 'react'

interface HeroButtonsProps {
  className?: string
  decorativeColors?: BlockColor[]
}

export function HeroButtons({ 
  className,
  decorativeColors = [BlockColor.TerminalYellow]
}: HeroButtonsProps) {
  return (
    <div className={`flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto ${className}`}>
      <DecorativeBlocks
        colors={decorativeColors}
        initialPlacement="bottom-left"
      >
        <Button
          size="lg"
          className="w-full md:w-[320px] text-base font-medium px-10 py-4 h-auto transition-all duration-300 hover:scale-105 relative group overflow-hidden origin-bottom-left hover:-translate-y-1 hover:translate-x-1"
        >
          <Link href="/signup" className="relative z-10">
            Try Free
          </Link>
        </Button>
      </DecorativeBlocks>
      <InputWithCopyButton
        value="npm install -g codebuff"
        className="w-full md:w-auto md:min-w-[320px] flex items-center overflow-hidden group relative"
      >
        <div className="terminal w-full flex items-center overflow-hidden group relative">
          <span className="absolute inset-0 bg-black opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
          <span className="absolute inset-0 bg-zinc-900 group-hover:bg-transparent transition-colors duration-500"></span>

          <div className="terminal-command group-hover:opacity-80 transition-opacity duration-300 relative z-10">
            <Terminal size={16} className="text-primary" />
            <code className="font-mono">npm install -g codebuff</code>
          </div>
        </div>
      </InputWithCopyButton>
    </div>
  )
}