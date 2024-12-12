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
    <div className="pt-6">
      <div className="container flex">
        <DocSidebar
          className="hidden lg:block w-64 shrink-0 sticky top-[24px] h-[calc(100vh-24px)] overflow-y-auto"
          onNavigate={() => setOpen(false)}
        />
        <main className="flex-1 pb-36 flex justify-center">{children}</main>
        <div className="w-64"></div>
      </div>
      <div className="flex items-center lg:hidden sticky bottom-0 z-50 bg-muted container p-4 rounded-t-lg">
        <Sheet
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!open) {
              // Preserve scroll position by preventing body scroll reset
              document.body.style.position = ''
              document.body.style.overflow = ''
              document.body.style.top = ''
            }
          }}
        >
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-2">
              <Menu className="h-6 w-6" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[33vh] p-6 overflow-y-auto">
            <DocSidebar onNavigate={() => setOpen(false)} />
          </SheetContent>
          <SheetTrigger asChild>
            <h1 className="text-2xl font-bold">
              {sections.find((section) => pathname.startsWith(section.href))
                ?.title || 'Documentation'}
            </h1>
          </SheetTrigger>
        </Sheet>
      </div>
    </div>
  )
}
