import type { Metadata } from 'next'

type Props = {
  params: Promise<{ category: string }>
  children: React.ReactNode
}

// Server component by default (no "use client")
export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>
}): Promise<Metadata> {
  const { category } = await params
  return {
    title: `${category} | Codebuff Docs`,
  }
}

export default function CategoryLayout({ children }: Props) {
  return <>{children}</>
}
