import React from 'react'
import { signOut } from 'next-auth/react'
import {
  SignedIn,
  SignedOut,
  SignInButton,
} from '@/vly/components/auth/AuthComponents'

interface NavItem {
  label: string
  href?: string
  onClick?: () => void
  requiresAuth?: boolean
  showWhenSignedOut?: boolean
  badge?: React.ReactNode
  icon?: React.ReactNode
}

interface MobileMenuProps {
  isOpen: boolean
  onClose: () => void
  navItems: NavItem[]
  styles: {
    mobileLink: string
    mobileLinkActive: string
    mobileLinkInactive: string
  }
  getMobileLinkClass: (href: string) => string
  menuRef: React.RefObject<HTMLDivElement | null>
}

export default function MobileMenu({
  isOpen,
  onClose,
  navItems,
  styles,
  getMobileLinkClass,
  menuRef,
}: MobileMenuProps) {
  const handleSignOut = () => {
    onClose()
    signOut({ callbackUrl: '/' })
  }

  const handleOpenProfile = () => {
    onClose()
    window.location.href = '/web'
  }

  if (!isOpen) return null

  return (
    <div
      ref={menuRef}
      className="animate-fade-in absolute right-0 top-14 z-50 mt-2 flex w-48 flex-col rounded-lg border border-white/20 bg-white/10 py-2 shadow-lg backdrop-blur-2xl"
      role="menu"
    >
      {navItems.map((item) => {
        const linkClass = item.href
          ? getMobileLinkClass(item.href)
          : styles.mobileLink + ' ' + styles.mobileLinkInactive

        if (item.requiresAuth) {
          return (
            <React.Fragment key={item.label}>
              <SignedIn>
                <button
                  className={linkClass}
                  onClick={item.onClick}
                  role="menuitem"
                >
                  <span className="inline-flex items-center">
                    {item.icon}
                    {item.label}
                    {item.badge}
                  </span>
                </button>
              </SignedIn>
              {item.showWhenSignedOut && (
                <SignedOut>
                  <SignInButton mode="modal" asChild>
                    <button
                      className={`${styles.mobileLink} ${styles.mobileLinkInactive}`}
                      onClick={onClose}
                      role="menuitem"
                    >
                      <span className="inline-flex items-center">
                        {item.icon}
                        {item.label}
                        {item.badge}
                      </span>
                    </button>
                  </SignInButton>
                </SignedOut>
              )}
            </React.Fragment>
          )
        }

        return (
          <button
            key={item.label}
            className={linkClass}
            onClick={item.onClick}
            role="menuitem"
          >
            <span className="inline-flex items-center">
              {item.icon}
              {item.label}
              {item.badge}
            </span>
          </button>
        )
      })}
      <div className="my-2 border-t border-zinc-200" />
      <SignedIn>
        <button
          className={`${styles.mobileLink} ${styles.mobileLinkInactive}`}
          onClick={handleOpenProfile}
          role="menuitem"
        >
          Manage account
        </button>
        <button
          className={`${styles.mobileLink} ${styles.mobileLinkInactive}`}
          onClick={handleSignOut}
          role="menuitem"
        >
          Sign out
        </button>
      </SignedIn>
      <SignedOut>
        <SignInButton mode="modal" asChild>
          <button
            className="mt-2 w-full rounded-full bg-[#7CFF3F] px-4 py-2 font-['Geist'] font-semibold text-white"
            style={{ fontSize: 16 }}
            onClick={onClose}
          >
            Sign In
          </button>
        </SignInButton>
      </SignedOut>
    </div>
  )
}
