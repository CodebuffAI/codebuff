import { BlogChrome } from '@/components/blog/blog-chrome'

export default function BlogLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <BlogChrome>{children}</BlogChrome>
}
