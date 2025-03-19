import Link from 'next/link'
import { Button } from './button'

export function Header() {
  return (
    <header className="w-full py-5 border-b border-zinc-800 sticky top-0 z-50 backdrop-blur-sm bg-black/80">
      <div className="codebuff-container flex items-center justify-between">
        <div className="flex items-center">
          <Link href="/" className="flex items-center space-x-2 group">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="transition-transform duration-300 group-hover:scale-110"
            >
              <rect
                width="24"
                height="24"
                rx="4"
                fill="black"
                stroke="white"
                strokeWidth="1"
              />
              <path d="M6 6H18V9H6V6Z" fill="#AAFF33" />
              <path d="M6 10.5H12V13.5H6V10.5Z" fill="#AAFF33" />
              <path d="M6 15H15V18H6V15Z" fill="#AAFF33" />
            </svg>
            <span className="text-xl font-medium group-hover:text-primary transition-colors duration-300">
              codebuff
            </span>
          </Link>
        </div>

        <div className="hidden md:flex items-center space-x-8">
          <nav className="flex items-center space-x-8">
            <Link
              href="/pricing"
              className="text-sm text-zinc-400 hover:text-white transition-colors duration-300"
            >
              Pricing
            </Link>
            <Link
              href="/docs"
              className="text-sm text-zinc-400 hover:text-white transition-colors duration-300"
            >
              Docs
            </Link>
            <Link
              href="/login"
              className="text-sm text-zinc-400 hover:text-white transition-colors duration-300"
            >
              Log in
            </Link>
          </nav>
          <Button
            asChild
            className="transition-transform duration-300 hover:scale-105"
          >
            <Link href="/signup" className="text-sm font-medium">
              Try Free
            </Link>
          </Button>
        </div>

        {/* Mobile menu button */}
        <div className="md:hidden">
          <Button
            variant="ghost"
            className="rounded-full w-9 h-9 p-0 hover:bg-zinc-800 transition-colors duration-300"
            aria-label="Menu"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              className="transition-transform duration-300 hover:scale-110"
            >
              <path
                d="M3 4.5H15"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3 9H15"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d="M3 13.5H15"
                stroke="white"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </Button>
        </div>
      </div>
    </header>
  )
}
