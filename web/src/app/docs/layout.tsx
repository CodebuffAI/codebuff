import { DocsLayoutClient } from '@/components/docs/docs-layout-client'

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <DocsLayoutClient>{children}</DocsLayoutClient>
}
