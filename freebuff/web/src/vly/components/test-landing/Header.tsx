'use client'

import React, { useState, useEffect } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { signOut, useSession } from 'next-auth/react'
import { useQuery } from 'convex/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from '@/vly/components/auth/AuthComponents'
import { Avatar, AvatarImage, AvatarFallback } from '@/vly/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/vly/components/ui/dropdown-menu'
import { api } from '@/convex/_generated/api'

export interface HeaderLink {
  label: string
  href?: string
  onClick?: () => void
  requiresAuth?: boolean
  external?: boolean
  badge?: React.ReactNode
}

export interface HeaderProps {
  logoSrc?: string
  logoAlt?: string
  links?: HeaderLink[]
  ctaText?: string
  ctaHref?: string
  className?: string
  showHome?: boolean
}

export const Header: React.FC<HeaderProps> = ({
  logoSrc = '/logo.svg',
  logoAlt = 'vly.ai',
  className = '',
  showHome = false,
}) => {
  const [isScrolled, setIsScrolled] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const router = useRouter()
  const pathname = usePathname()
  const { data: session, status } = useSession()
  const user = session?.user
  const isLoaded = status !== 'loading'
  const currentUserId = useQuery(api.community.getCurrentUserId)
  const userName = user?.name || 'User'
  const userEmail = user?.email || ''
  const userImage = user?.image || undefined

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50)
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  const handleOpenDiscord = () => {
    window.open('https://discord.gg/2gSmB9DxJW', '_blank')
  }

  // Check if current path matches the nav item
  const isActive = (href?: string) => {
    if (!href) return false
    if (href === '/') return pathname === '/'
    // For /web/dashboard, only match exactly.
    if (href === '/web/dashboard') {
      return pathname === '/web/dashboard'
    }
    return pathname?.startsWith(href)
  }

  const navItems: HeaderLink[] = [
    ...(showHome
      ? [
          {
            label: 'Home',
            href: '/web',
          },
        ]
      : []),
    {
      label: 'My Projects',
      href: '/web/dashboard',
      requiresAuth: true,
    },
    {
      label: 'Community',
      href: '/web/community',
    },
    {
      label: 'Earn',
      href: '/web/earn',
      badge: (
        <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
          new
        </span>
      ),
    },
    {
      label: 'Discord',
      onClick: handleOpenDiscord,
      external: true,
    },
    {
      label: 'Pricing',
      href: '/web/pricing',
    },
    {
      label: 'Contact',
      href: '/web/contact',
    },
  ]

  const renderNavItem = (item: HeaderLink, index: number) => {
    const active = isActive(item.href)
    const baseClass = `relative z-10 flex items-center justify-center rounded-full transition-all cursor-pointer ${
      active ? 'bg-black/10 font-medium' : 'hover:bg-black/5 font-normal'
    } ${
      isScrolled
        ? 'px-2.5 py-1 text-xs text-[#1a1a1a]'
        : 'px-3 py-1.5 text-sm text-[#1a1a1a]'
    }`

    if (item.onClick) {
      return (
        <button key={index} onClick={item.onClick} className={baseClass}>
          <span className="inline-flex items-center">
            {item.label}
            {item.badge}
          </span>
        </button>
      )
    }

    if (item.requiresAuth) {
      return (
        <React.Fragment key={index}>
          <SignedIn>
            <Link href={item.href || '#'} className={baseClass}>
              <span className="inline-flex items-center">
                {item.label}
                {item.badge}
              </span>
            </Link>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal" asChild>
              <button className={baseClass}>
                <span className="inline-flex items-center">
                  {item.label}
                  {item.badge}
                </span>
              </button>
            </SignInButton>
          </SignedOut>
        </React.Fragment>
      )
    }

    return (
      <Link key={index} href={item.href || '#'} className={baseClass}>
        <span className="inline-flex items-center">
          {item.label}
          {item.badge}
        </span>
      </Link>
    )
  }

  return (
    <header
      className={`fixed left-0 right-0 top-0 z-50 w-full border-b border-transparent bg-transparent transition-all duration-300 ${className}`}
    >
      <div
        className={`mx-auto flex max-w-[1280px] items-center justify-between px-8 transition-all duration-300 ${
          isScrolled ? 'py-2' : 'py-4'
        }`}
      >
        <div
          className={`flex items-center gap-2 transition-all duration-300 ${
            isScrolled
              ? 'translate-x-[-48px] scale-50'
              : 'translate-x-0 scale-100'
          }`}
        >
          <Link href="/web">
            <Image
              src={logoSrc}
              alt={logoAlt}
              width={100}
              height={100}
              className="h-[60px] w-[60px] object-contain sm:h-[80px] sm:w-[80px] md:h-[100px] md:w-[100px]"
            />
          </Link>
        </div>

        {/* Mobile Menu Button */}
        <button
          onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          className="flex items-center justify-center p-2 md:hidden"
          aria-label="Toggle menu"
        >
          <div className="flex flex-col gap-1.5">
            <span
              className={`block h-0.5 w-6 bg-[#1a1a1a] transition-all duration-300 ${isMobileMenuOpen ? 'translate-y-2 rotate-45' : ''}`}
            />
            <span
              className={`block h-0.5 w-6 bg-[#1a1a1a] transition-all duration-300 ${isMobileMenuOpen ? 'opacity-0' : ''}`}
            />
            <span
              className={`block h-0.5 w-6 bg-[#1a1a1a] transition-all duration-300 ${isMobileMenuOpen ? '-translate-y-2 -rotate-45' : ''}`}
            />
          </div>
        </button>

        {/* Desktop Navigation */}
        <div className="relative hidden md:block">
          <div
            className={`flex items-center rounded-full border transition-all duration-500 ${
              isScrolled
                ? 'gap-1 border-white/60 bg-white/50 px-2 py-0.5 shadow-lg shadow-black/[0.03] backdrop-blur-xl'
                : 'gap-3 border-transparent bg-transparent px-4 py-1 shadow-none backdrop-blur-0'
            }`}
          >
            {navItems.map((item, index) => renderNavItem(item, index))}

            {/* Auth Button */}
            {isLoaded ? (
              <>
                <SignedIn>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        className={`group relative flex items-center justify-center overflow-hidden rounded-full transition-all duration-300 hover:scale-105 focus:outline-none ${
                          isScrolled ? 'h-7 w-7' : 'h-9 w-9'
                        }`}
                        aria-label="User menu"
                      >
                        <Avatar className={isScrolled ? 'h-7 w-7' : 'h-9 w-9'}>
                          <AvatarImage src={userImage} alt={userName} />
                          <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
                        </Avatar>
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      className="z-[10001] w-56 rounded-lg border border-gray-200 bg-white p-0 shadow-lg"
                      align="end"
                    >
                      <div className="border-b border-gray-100 p-4">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-10 w-10">
                            <AvatarImage src={userImage} alt={userName} />
                            <AvatarFallback>
                              {userName.charAt(0)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-gray-900">
                              {userName}
                            </p>
                            <p className="truncate text-sm text-gray-500">
                              {userEmail}
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="py-1">
                        <DropdownMenuItem
                          className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900"
                          onClick={() => router.push('/web/dashboard')}
                        >
                          My Projects
                        </DropdownMenuItem>
                        {currentUserId ? (
                          <DropdownMenuItem
                            className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900"
                            onClick={() =>
                              router.push(
                                `/web/community/profile/${currentUserId}`,
                              )
                            }
                          >
                            Profile
                          </DropdownMenuItem>
                        ) : null}
                        <DropdownMenuItem
                          className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900"
                          onClick={() =>
                            router.push('/web/dashboard/preferences')
                          }
                        >
                          Manage account
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900"
                          onClick={() => router.push('/web/dashboard')}
                        >
                          Dashboard
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900"
                          onClick={() =>
                            router.push('/web/dashboard/preferences')
                          }
                        >
                          Email preferences
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="cursor-pointer px-4 py-2 text-sm !text-gray-600 hover:!bg-gray-100 hover:!text-gray-900"
                          onClick={() => signOut({ callbackUrl: '/' })}
                        >
                          Sign out
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </SignedIn>
                <SignedOut>
                  <SignInButton mode="modal" asChild>
                    <button
                      className={`relative z-10 flex items-center justify-center rounded-full bg-[#1a1a1a] transition-all hover:bg-black ${
                        isScrolled
                          ? 'px-3 py-1 text-xs font-normal text-white'
                          : 'px-4 py-2 text-sm font-normal text-white'
                      }`}
                    >
                      Sign In
                    </button>
                  </SignInButton>
                </SignedOut>
              </>
            ) : (
              <div
                className={`animate-pulse rounded-full bg-gray-200 ${
                  isScrolled ? 'h-7 w-7' : 'h-9 w-9'
                }`}
              />
            )}
          </div>
        </div>
      </div>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* Mobile Menu Panel */}
      <div
        className={`fixed right-0 top-0 z-50 h-full w-[280px] bg-white shadow-xl transition-transform duration-300 md:hidden ${
          isMobileMenuOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex h-full flex-col">
          {/* Mobile Menu Header */}
          <div className="flex items-center justify-between border-b p-4">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-2"
              aria-label="Close menu"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          {/* Mobile Menu Items */}
          <nav className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col gap-2">
              {navItems.map((item, index) => {
                const active = isActive(item.href)
                const baseClass = `flex items-center px-4 py-3 rounded-lg transition-all cursor-pointer ${
                  active
                    ? 'bg-black/10 font-medium text-[#1a1a1a]'
                    : 'hover:bg-black/5 font-normal text-[#1a1a1a]'
                }`

                if (item.onClick) {
                  return (
                    <button
                      key={index}
                      onClick={() => {
                        item.onClick?.()
                        setIsMobileMenuOpen(false)
                      }}
                      className={baseClass}
                    >
                      <span className="inline-flex items-center">
                        {item.label}
                        {item.badge}
                      </span>
                    </button>
                  )
                }

                if (item.requiresAuth) {
                  return (
                    <React.Fragment key={index}>
                      <SignedIn>
                        <button
                          onClick={() => {
                            router.push(item.href || '#')
                            setIsMobileMenuOpen(false)
                          }}
                          className={baseClass}
                        >
                          <span className="inline-flex items-center">
                            {item.label}
                            {item.badge}
                          </span>
                        </button>
                      </SignedIn>
                      <SignedOut>
                        <SignInButton mode="modal" asChild>
                          <button className={baseClass}>
                            <span className="inline-flex items-center">
                              {item.label}
                              {item.badge}
                            </span>
                          </button>
                        </SignInButton>
                      </SignedOut>
                    </React.Fragment>
                  )
                }

                return (
                  <button
                    key={index}
                    onClick={() => {
                      router.push(item.href || '#')
                      setIsMobileMenuOpen(false)
                    }}
                    className={baseClass}
                  >
                    <span className="inline-flex items-center">
                      {item.label}
                      {item.badge}
                    </span>
                  </button>
                )
              })}
            </div>
          </nav>

          {/* Mobile Menu Footer with Auth */}
          <div className="border-t p-4">
            <SignedIn>
              {user && (
                <div className="flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={userImage} alt={userName} />
                      <AvatarFallback>{userName.charAt(0)}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#1a1a1a]">
                        {userName}
                      </p>
                      <p className="text-xs text-gray-500">{userEmail}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (currentUserId) {
                        router.push(`/web/community/profile/${currentUserId}`)
                      }
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100"
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => {
                      router.push('/web/dashboard/preferences')
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100"
                  >
                    Profile Settings
                  </button>
                  <button
                    onClick={() => {
                      router.push('/web/dashboard')
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100"
                  >
                    Dashboard
                  </button>
                  <button
                    onClick={() => {
                      router.push('/web/dashboard/preferences')
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm transition-colors hover:bg-gray-100"
                  >
                    Email Preferences
                  </button>
                  <button
                    onClick={() => {
                      signOut({ callbackUrl: '/' })
                      setIsMobileMenuOpen(false)
                    }}
                    className="w-full rounded-lg px-4 py-2 text-left text-sm text-red-600 transition-colors hover:bg-gray-100"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </SignedIn>
            <SignedOut>
              <div className="flex flex-col gap-2">
                <SignInButton mode="modal" asChild>
                  <button className="w-full rounded-lg bg-black px-4 py-2 text-white transition-colors hover:bg-gray-800">
                    Sign in
                  </button>
                </SignInButton>
              </div>
            </SignedOut>
          </div>
        </div>
      </div>
    </header>
  )
}
