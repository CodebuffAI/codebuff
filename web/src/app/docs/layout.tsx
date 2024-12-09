'use client'

import { DocSidebar } from '@/components/docs/doc-sidebar'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="container flex gap-12 px-4 py-6">
      <DocSidebar className="w-64 shrink-0 sticky top-[24px] h-[calc(100vh-24px)] overflow-y-auto" />
      <main className="flex-1">{children}</main>
    </div>
  )
}
