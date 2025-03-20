import Link from 'next/link'
import { Button } from './button'
import { Terminal } from 'lucide-react'
import { BlockColor } from './decorative-blocks'
import { InputWithCopyButton } from './input-with-copy'

export function Hero() {
  return (
    <section className="pt-24 pb-32 text-center relative overflow-hidden">
      <div className="codebuff-container relative z-10">
        <h1 className="hero-heading mb-8 text-white text-balance">
          <span className="relative inline-block">
            <span className="relative z-10">Revolutionize</span>
          </span>{' '}
          Your{' '}
          <span className="relative inline-block">
            <span className="relative z-10">Codeflow</span>
            <span
              className="absolute -inset-2 -z-10 opacity-20"
              style={{
                background: BlockColor.CRTAmber,
                transform: 'rotate(-2deg) scale(1.05)',
              }}
            ></span>
          </span>
        </h1>

        <p className="hero-subtext mb-14 text-center">
          Codebuff is the smartest AI partner. In the terminal or your favorite
          IDE,
          <br className="hidden md:block" />
          it works where you work and knows your entire stack.
        </p>

        <div className="flex flex-col md:flex-row items-center justify-center gap-6 max-w-2xl mx-auto">
          <Button
            size="lg"
            className="w-full md:w-auto text-base font-medium px-10 py-4 h-auto transition-all duration-300 hover:scale-105 relative group overflow-hidden"
          >
            <span className="absolute inset-0 w-full h-full bg-primary group-hover:translate-y-full transition-transform duration-300"></span>
            <span className="absolute inset-0 w-full h-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 scale-90 rounded-sm"></span>
            <Link href="/signup" className="relative z-10">
              Try Free
            </Link>
          </Button>

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
      </div>
    </section>
  )
}
