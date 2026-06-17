import { Hero } from '@/components/Hero'
import { Navbar } from '@/components/Navbar'
import { BlogPreview } from '@/components/sections/BlogPreview'
import { CtaFooter } from '@/components/sections/CtaFooter'
import { Faq } from '@/components/sections/Faq'
import { Media } from '@/components/sections/Media'
import { Products } from '@/components/sections/Products'
import { UsageMap } from '@/components/sections/UsageMap'

export default function App() {
  return (
    <div className="relative min-h-screen bg-black">
      <Navbar />
      <main>
        <Hero />
        {/* Everything below the hero lives on pure black for a seamless seam. */}
        <div className="relative z-10 bg-black">
          <Products />
          <UsageMap />
          <BlogPreview />
          <Media />
          <Faq />
          <CtaFooter />
        </div>
      </main>
    </div>
  )
}
