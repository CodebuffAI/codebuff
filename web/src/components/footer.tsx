'use client'

import { Separator } from '@/components/ui/separator'
import Link from 'next/link'
import Image from 'next/image'
import { siteConfig } from '@/lib/constant'
import { LinkedInInsightTag } from 'nextjs-linkedin-insight-tag'
import { usePathname } from 'next/navigation'

export const Footer = () => {
  const pathname = usePathname()
  if (pathname.startsWith('/docs')) {
    return <></>
  }

  return (
    <footer className="w-full border-t z-10">
      <div className="container mx-auto flex flex-col gap-4 py-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 py-4">
          {/* Logo and company name */}
          <div className="flex items-center space-x-2">
            <Link href="/" className="flex items-center space-x-2">
              <Image
                src="/favicon/logo-and-name.ico"
                alt="Codebuff Logo"
                width={200}
                height={100}
                className="rounded-sm"
              />
            </Link>
          </div>

          {/* Site Map */}
          <div>
            <h3 className="font-semibold mb-4">Site</h3>
            <nav className="flex flex-col space-y-2">
              <Link
                href="/"
                className="text-muted-foreground hover:text-primary"
              >
                Home
              </Link>
              <Link
                href="/docs"
                target="_blank"
                className="text-muted-foreground hover:text-primary"
              >
                Docs
              </Link>
              <Link
                href="https://news.codebuff.com"
                target="_blank"
                className="text-muted-foreground hover:text-primary"
              >
                News
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

        <Separator />

        <div className="text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} {siteConfig.title}. All rights reserved.
        </div>
      </div>
      <LinkedInInsightTag />
    </footer>
  )
}
