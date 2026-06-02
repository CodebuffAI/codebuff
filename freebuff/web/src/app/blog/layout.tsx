import { BlogNav } from '@/components/blog/blog-nav'

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-screen bg-black text-zinc-100">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(ellipse_60%_50%_at_50%_-10%,rgba(124,255,63,0.10),transparent_60%)]" />
      <BlogNav />
      <main className="relative">{children}</main>
    </div>
  )
}
