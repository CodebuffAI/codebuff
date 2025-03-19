import Link from 'next/link'
import { Button } from './button'
import { Terminal } from 'lucide-react'

export function Hero() {
  return (
    <section className="pt-24 pb-32 text-center relative overflow-hidden">
      <div className="codebuff-container relative z-10">
        <h1 className="hero-heading mb-8 text-white text-balance">
          <span className="relative inline-block">
            <span className="relative z-10">Revolutionize</span>
            <span className="absolute bottom-2 left-0 w-full h-3 bg-primary/20 -z-10 skew-x-3"></span>
          </span>{' '}
          Your{' '}
          <span className="relative inline-block">
            <span className="relative z-10">Codeflow</span>
            <span className="absolute bottom-2 left-0 w-full h-3 bg-primary/20 -z-10 -skew-x-3"></span>
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

          <div className="terminal w-full md:w-auto md:min-w-[320px] flex items-center overflow-hidden group relative">
            <span className="absolute inset-0 bg-black opacity-0 group-hover:opacity-100 transition-opacity duration-500"></span>
            <span className="absolute inset-0 bg-zinc-900 group-hover:bg-transparent transition-colors duration-500"></span>

            <div className="terminal-command group-hover:opacity-80 transition-opacity duration-300 relative z-10">
              <Terminal size={16} className="text-primary" />
              <code className="font-mono">npm install -g codebuff</code>
            </div>
            <button
              className="ml-auto p-1 text-zinc-400 hover:text-primary transition-colors duration-300 relative z-10"
              aria-label="Copy to clipboard"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 16 16"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className="transition-transform duration-300 hover:scale-110"
              >
                <path
                  d="M5.75 4.75H3.75C3.19772 4.75 2.75 5.19772 2.75 5.75V12.25C2.75 12.8023 3.19772 13.25 3.75 13.25H10.25C10.8023 13.25 11.25 12.8023 11.25 12.25V10.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <rect
                  x="5.75"
                  y="2.75"
                  width="7.5"
                  height="7.5"
                  rx="1.25"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
