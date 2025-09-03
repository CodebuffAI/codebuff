'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

import { DocSidebar, sections } from '@/components/docs/doc-sidebar'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const [isFixed, setIsFixed] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)

  // Track scroll position to determine if sidebar should be fixed
  useEffect(() => {
    const handleScroll = () => {
      // The header with logo is approximately 72px tall (p-4 = 16px top/bottom + content height)
      // Fix the sidebar when the user scrolls past the header
      if (window.scrollY > 72) {
        setIsFixed(true)
      } else {
        setIsFixed(false)
      }
    }

    window.addEventListener('scroll', handleScroll)
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // New: Smoothly scroll to hash target on back/forward navigation
  useEffect(() => {
    const handleHashChange = () => {
      const id = window.location.hash.slice(1)
      if (id) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
      }
    }

    // If landing with a hash, ensure smooth scroll to target
    handleHashChange()

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // Handle sidebar scroll for dynamic fade effects
  useEffect(() => {
    const sidebarElement = sidebarRef.current
    if (!sidebarElement) return

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = sidebarElement
      const isAtTop = scrollTop === 0
      const isAtBottom = scrollTop + clientHeight >= scrollHeight - 1

      setShowTopFade(!isAtTop)
      setShowBottomFade(!isAtBottom)
    }

    // Check initial state
    handleScroll()

    sidebarElement.addEventListener('scroll', handleScroll)
    return () => sidebarElement.removeEventListener('scroll', handleScroll)
  }, [])

  return (
    <div className="pt-8">
      <div className="container flex md:space-x-8 overflow-x-hidden">
        <div className="hidden lg:block w-64 shrink-0">
          <div
            className={`w-64 z-40 transition-all duration-200 ease-in-out ${
              isFixed ? 'fixed top-4 h-[calc(100vh-2rem)]' : 'relative'
            }`}
          >
            {/* Dynamic gradient fade indicators */}
            {showTopFade && (
              <div className="absolute top-0 left-0 right-0 h-6 bg-gradient-to-b from-background to-transparent pointer-events-none z-10 rounded-t-lg transition-opacity duration-200" />
            )}
            {showBottomFade && (
              <div className="absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-background to-transparent pointer-events-none z-10 rounded-b-lg transition-opacity duration-200" />
            )}

            {/* Enhanced scrollable container */}
            <div
              ref={sidebarRef}
              className="relative h-full overflow-y-auto pr-4 pl-4 pt-6 pb-6 custom-scrollbar bg-background/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg"
            >
              <DocSidebar className="" onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
        <main className="flex-1 mx-auto pb-36 md:px-8 min-w-0">{children}</main>
      </div>
      <div className="flex items-center lg:hidden sticky bottom-0 z-50 bg-background/80 backdrop-blur-sm container p-4 rounded-t-lg border-t">
        <Sheet
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!open) {
              document.body.style.position = ''
              document.body.style.overflow = ''
              document.body.style.top = ''
            }
          }}
        >
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-4">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-[80vh] p-6 pt-12 overflow-y-auto"
          >
            <DocSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
          <SheetTrigger asChild>
            <h1 className="text-xl font-semibold w-full">
              {sections.find((section) => pathname.startsWith(section.href))
                ?.title || 'Documentation'}
            </h1>
          </SheetTrigger>
        </Sheet>
      </div>
    </div>
  )
}
