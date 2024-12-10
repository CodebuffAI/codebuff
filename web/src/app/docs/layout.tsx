'use client'

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
  return (
    <div className="py-6">
      <div className="container flex gap-12">
        <DocSidebar className="hidden lg:block w-64 shrink-0 sticky top-[24px] h-[calc(100vh-24px)] overflow-y-auto" />
        <main className="flex-1">{children}</main>
      </div>
      <div className="flex items-center lg:hidden sticky bottom-0 z-50 bg-muted container p-4 border">
        <Sheet
          onOpenChange={(open) => {
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
            <DocSidebar />
          </SheetContent>
        </Sheet>
        <h1 className="text-2xl font-bold">
          {sections.find((section) => pathname.startsWith(section.href))
            ?.title || 'Documentation'}
        </h1>
      </div>
    </div>
  )
}
