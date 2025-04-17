import type { Metadata } from 'next'

type Props = {
  params: { category: string }
  children: React.ReactNode
}

// Server component by default (no "use client")
export async function generateMetadata({
  params,
}: {
  params: { category: string }
}): Promise<Metadata> {
  return {
    title: `${params.category} | Codebuff Docs`,
  }
}

export default function CategoryLayout({ children }: Props) {
  return <>{children}</>
}