'use client'

import { useState } from 'react'
import { DocSidebar, sections } from '@/components/docs/doc-sidebar'
import { usePathname } from 'next/navigation'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  return (
    <div className="pt-8">
      <div className="container flex md:space-x-8">
        <DocSidebar
          className="hidden lg:block w-64 shrink-0 sticky top-[24px] h-[calc(100vh-24px)] overflow-y-auto pr-4"
          onNavigate={() => setOpen(false)}
        />
        <main className="flex-1 mx-auto pb-36 md:px-8">{children}</main>
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
