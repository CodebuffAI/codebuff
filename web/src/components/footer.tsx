'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LinkedInInsightTag } from 'nextjs-linkedin-insight-tag'

import { Separator } from '@/components/ui/separator'
import { siteConfig } from '@/lib/constant'

type LinkInfo = { text: string; href: string; target?: string }

const siteLinks: LinkInfo[] = [
  { text: 'Home', href: '/' },
  { text: 'Docs', href: '/docs' },
  // NEWS DISABLED: Uncomment to re-enable news link in footer
  // { text: 'News', href: 'https://news.codebuff.com', target: '_blank' },
  { text: 'Pricing', href: '/pricing' },
  { text: 'Usage', href: '/usage' },
]

const legalLinks: LinkInfo[] = [
  { text: 'Privacy Policy', href: '/privacy-policy' },
  { text: 'Terms of Service', href: '/terms-of-service' },
]

const communityLinks: LinkInfo[] = [
  {
    text: 'GitHub',
    href: 'https://github.com/CodebuffAI/codebuff',
    target: '_blank',
  },
  { text: 'Discord', href: 'https://codebuff.com/discord', target: '_blank' },
]

const authLinks: LinkInfo[] = [{ text: 'Login', href: '/login' }]

const publicPaths = [
  ...authLinks,
  ...legalLinks,
  ...communityLinks,
  ...siteLinks.filter((link) => link.href !== '/docs'),
]
  .map((link) => link.href)
  .filter((href) => !href.startsWith('http'))

export const Footer = () => {
  const pathname = usePathname() ?? '/'
  const isPublicPage = publicPaths.includes(pathname)

  if (!isPublicPage) {
    return null
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
                priority
                className="rounded-sm"
              />
            </Link>
          </div>

          {/* Site Map */}
          <div>
            <h3 className="font-semibold mb-4">Site</h3>
            <nav className="flex flex-col space-y-2">
              {siteLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  target={link.target}
                  className="text-muted-foreground hover:text-primary"
                >
                  {link.text}
                </Link>
              ))}
            </nav>
          </div>

          {/* Legal */}
          <div>
            <h3 className="font-semibold mb-4">Legal</h3>
            <nav className="flex flex-col space-y-2">
              {legalLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-muted-foreground hover:text-primary"
                >
                  {link.text}
                </Link>
              ))}
            </nav>
          </div>

          {/* Community */}
          <div>
            <h3 className="font-semibold mb-4">Community</h3>
            <nav className="flex flex-col space-y-2">
              {communityLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  target={link.target}
                  className="text-muted-foreground hover:text-primary"
                >
                  {link.text}
                </Link>
              ))}
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
