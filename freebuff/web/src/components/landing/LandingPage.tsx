import { Hero } from './Hero'
import { LandingNavbar } from './Navbar'
import { BlogPreview } from './sections/BlogPreview'
import type { BlogPostPreview } from './sections/BlogPreview'
import { CtaFooter } from './sections/CtaFooter'
import { Faq } from './sections/Faq'
import { LiveUsage } from './sections/LiveUsage'
import { Media } from './sections/Media'
import { Products } from './sections/Products'
import { Testimonial } from './sections/Testimonial'

/**
 * Exact replica of the Vite landing-lab prototype, composed for Next.js.
 *
 * The page forces a dark, Manrope-based context (`dark`, `font-paragraph`)
 * regardless of the app's active theme so it always matches the prototype.
 * `posts` are real blog posts fetched server-side and passed down.
 */
export function LandingPage({ posts }: { posts: BlogPostPreview[] }) {
  return (
    <div className="dark relative min-h-screen bg-black font-paragraph font-light text-white">
      <LandingNavbar />
      <main>
        <Hero />
        {/* Everything below the hero lives on pure black for a seamless seam. */}
        <div className="relative z-10 bg-black">
          <Products />
          <Testimonial />
          <LiveUsage />
          <BlogPreview posts={posts} />
          <Media />
          <Faq />
          <CtaFooter />
        </div>
      </main>
    </div>
  )
}
