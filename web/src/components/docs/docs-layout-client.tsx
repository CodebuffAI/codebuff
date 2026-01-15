'use client'

import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { ChevronUp, Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState, useEffect, useRef } from 'react'

import { DocSidebar, sections } from '@/components/docs/doc-sidebar'
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'

export function DocsLayoutClient({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? '/docs'
  const [open, setOpen] = useState(false)
  const [showTopFade, setShowTopFade] = useState(false)
  const [showBottomFade, setShowBottomFade] = useState(false)
  const sidebarRef = useRef<HTMLDivElement>(null)
  const stickyTop = 64 // navbar height

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
      <div className="container flex md:space-x-8">
        <div className="hidden lg:block w-64 shrink-0">
          <div
            className="w-64 sticky z-40"
            style={{
              top: `${stickyTop}px`,
              height: `calc(100vh - ${stickyTop}px - 3rem)`,
            }}
          >
            {/* Dynamic gradient fade indicators */}
            {showTopFade && (
              <div className="absolute top-0 left-0 right-0 h-12 bg-gradient-to-b from-background via-background/60 to-transparent pointer-events-none z-10 rounded-t-lg transition-opacity duration-200" />
            )}
            {showBottomFade && (
              <div className="absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-background via-background/60 to-transparent pointer-events-none z-10 rounded-b-lg transition-opacity duration-200" />
            )}

            {/* Enhanced scrollable container */}
            <div
              ref={sidebarRef}
              className="relative h-full overflow-y-auto pr-4 pl-4 pt-4 pb-6 custom-scrollbar bg-background/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg"
            >
              <DocSidebar onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
        <main className="flex-1 mx-auto pb-36 md:px-8 min-w-0 pt-8">
          {children}
        </main>
      </div>
      <div className="lg:hidden sticky bottom-0 z-50 bg-background/80 backdrop-blur-sm rounded-t-lg border-t">
        <Sheet
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen)
            // Reset any body styles when the sheet is closed
            if (!isOpen) {
              document.body.style.position = ''
              document.body.style.overflow = ''
              document.body.style.top = ''
            }
          }}
        >
          <SheetTrigger asChild>
            <button className="flex items-center w-full px-4 py-4 hover:bg-accent/50 transition-colors">
              <div className="container flex items-center justify-between">
                <div className="flex items-center">
                  <Menu className="h-5 w-5 mr-4" />
                  <span className="text-xl font-semibold">
                    {sections.find((section) =>
                      pathname.startsWith(section.href),
                    )?.title || 'Documentation'}
                  </span>
                </div>
                <ChevronUp className="h-5 w-5 text-muted-foreground" />
              </div>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-[80vh] p-6 pt-12 overflow-y-auto"
          >
            <VisuallyHidden>
              <SheetTitle>Documentation Navigation</SheetTitle>
            </VisuallyHidden>
            <DocSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>
    </div>
  )
}
