'use client'

import { Menu } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'

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

  return (
    <div className="pt-8">
      <div className="container flex md:space-x-8 overflow-x-hidden">
        <div className="hidden lg:block w-64 shrink-0">
          <DocSidebar
            className="fixed top-24 w-64 h-[calc(100vh-12rem)] overflow-y-auto pr-4 z-40"
            onNavigate={() => setOpen(false)}
          />
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
