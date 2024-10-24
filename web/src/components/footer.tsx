import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import Image from 'next/image'
import { siteConfig } from '@/lib/constant'

export const Footer = () => {
  return (
    <footer className="w-full border-t z-10">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Logo and company name */}
          <div className="flex items-center space-x-2">
            <Link href="/" className="flex items-center space-x-2">
              <Image
                src="/favicon/apple-touch-icon.png"
                alt="Manicode Logo"
                width={32}
                height={32}
                className="rounded-sm"
              />
              <span className="font-bold text-xl">{siteConfig.title}</span>
            </Link>
          </div>

          {/* Site Map */}
          <div>
            <h3 className="font-semibold mb-4">Site Map</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="/"
                className="text-muted-foreground hover:text-primary"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="text-muted-foreground hover:text-primary"
              >
                Pricing
              </Link>
              <Link
                href="/usage"
                className="text-muted-foreground hover:text-primary"
              >
                Usage
              </Link>
            </nav>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="/privacy-policy"
                className="text-muted-foreground hover:text-primary"
              >
                Privacy Policy
              </Link>
              <Link
                href="/terms-of-service"
                className="text-muted-foreground hover:text-primary"
              >
                Terms of Service
              </Link>
            </nav>
          </div>

          {/* Community */}
          <div>
            <h3 className="font-semibold mb-4">Community</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="https://discord.gg/mcWTGjgTj3"
                target="_blank"
                className="text-muted-foreground hover:text-primary"
              >
                Discord
              </Link>
            </nav>
          </div>
        </div>

        <Separator className="my-4" />

        <div className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.title}. All rights reserved.
        </div>
      </div>
    </footer>
  )
}
