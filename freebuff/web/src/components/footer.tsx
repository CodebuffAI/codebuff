import Image from 'next/image'
import Link from 'next/link'

export function Footer() {
  return (
    <footer className="w-full border-t">
      <div className="container mx-auto flex flex-col gap-4 py-8 px-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center space-x-2">
              <Image
                src="/logo-icon.png"
                alt="Freebuff"
                width={24}
                height={24}
                className="rounded-sm"
              />
              <span className="text-lg tracking-widest font-serif text-white">
                freebuff
              </span>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              The world&apos;s strongest free coding agent.
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Links</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="https://codebuff.com/docs"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Docs
              </Link>
              <Link
                href="https://github.com/CodebuffAI/codebuff"
                target="_blank"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                GitHub
              </Link>
              <Link
                href="https://codebuff.com/discord"
                target="_blank"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Discord
              </Link>
            </nav>
          </div>

          <div>
            <h3 className="font-semibold mb-3">Legal</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="https://codebuff.com/privacy-policy"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Privacy Policy
              </Link>
              <Link
                href="https://codebuff.com/terms-of-service"
                className="text-sm text-muted-foreground hover:text-primary"
              >
                Terms of Service
              </Link>
            </nav>
          </div>
        </div>

        <div className="border-t pt-4 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Freebuff. Built on the{' '}
          <Link
            href="https://codebuff.com"
            className="hover:text-primary underline underline-offset-4"
          >
            Codebuff
          </Link>{' '}
          platform.
        </div>
      </div>
    </footer>
  )
}
