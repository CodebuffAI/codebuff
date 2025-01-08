'use client'
import { useState, useEffect } from 'react'
import InteractiveTerminalDemo from '@/components/InteractiveTerminalDemo'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  FolderCodeIcon,
  TerminalIcon,
  Copy,
  ZapIcon,
  Play,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { useToast } from '@/components/ui/use-toast'
import Marquee from '@/components/ui/marquee'
import { Testimonial, testimonials } from '@/lib/testimonials'
import { faqs } from '@/lib/faq'
import { cn } from '@/lib/utils'
import { storeSearchParams } from '@/lib/trackConversions'

const ReviewCard = ({ t }: { t: Testimonial }) => {
  return (
    <figure
      className={cn(
        'relative w-64 lg:w-80 cursor-pointer overflow-hidden rounded-xl border p-6',
        // light styles
        'border-gray-950/[.1] bg-gray-950/[.01] hover:bg-gray-950/[.05]',
        // dark styles
        'dark:border-gray-50/[.1] dark:bg-gray-50/[.10] dark:hover:bg-gray-50/[.15]'
      )}
    >
      <div className="flex justify-between">
        <div className="flex flex-row items-center gap-2">
          <Image
            className="rounded-full"
            width={32}
            height={32}
            alt=""
            src={
              t.avatar ??
              `https://avatar.vercel.sh/${t.author.split(' ').join('-').toLowerCase()}?size=32`
            }
            priority={false}
            loading="lazy"
          />
          <div className="flex flex-col">
            <figcaption className="text-sm font-medium dark:text-white">
              {t.author}
            </figcaption>
            <p className="text-xs font-medium dark:text-white/40">{t.title}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <ExternalLink
            className="h-4 w-4"
            onClick={() => window.open(t.link)}
          />
        </div>
      </div>
      <blockquote className="mt-4 text-sm lg:text-base">{t.quote}</blockquote>
    </figure>
  )
}

const Home = () => {
  const { theme } = useTheme()
  const { toast } = useToast()
  const [isVideoOpen, setIsVideoOpen] = useState(false)
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(null)
  const searchParams = useSearchParams()

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  const copyToClipboard = () => {
    navigator.clipboard.writeText('npm install -g codebuff')
    toast({
      title: `Copied to clipboard`,
      description: "Let's code! 🤖",
    })
  }

  return (
    <div className="overflow-hidden">
      <BackgroundBeams />

      <div className="max-w-6xl mx-auto">
        <main className="px-6 relative z-10 text-center">
          <h1 className="text-4xl md:text-7xl font-bold mb-4">
            <span className="whitespace-nowrap">Code faster</span>{' '}
            <span className="whitespace-nowrap">with AI</span>
          </h1>
          <p className="text-xl md:text-2xl text-muted-foreground mb-16">
            <span className="whitespace-nowrap">A coding companion</span>{' '}
            <span className="whitespace-nowrap">in your terminal</span>
          </p>
        </main>

        <div className="relative w-full flex items-center justify-center px-4 rounded-lg">
          <div className="relative h-full flex rounded-lg overflow-hidden">
            <video
              className="rounded-lg shadow-lg max-h-full w-auto"
              autoPlay
              muted
              loop
              playsInline
              disableRemotePlayback
              preload="auto"
            >
              <source src="/codebuff-intro1.mp4" type="video/mp4" />
              <source src="/codebuff-intro1.webm" type="video/webm" />
            </video>
          </div>
        </div>

        <section className="relative z-10 text-center py-8">
          <div className="mb-4">Try now for free:</div>

          <div className="inline-block">
            <div className="px-4 bg-gray-800 rounded-lg p-4 flex items-center gap-2">
              <code className="text-white">npm install -g codebuff</code>
              <Copy
                className="h-4 w-4 text-gray-400 hover:text-white cursor-pointer"
                onClick={copyToClipboard}
              />
            </div>
          </div>
        </section>

        <section id="features" className="px-4 py-20 relative z-10 space-y-16">
          <h2 className="text-3xl md:text-4xl font-bold mb-12 text-center px-4 md:px-0">
            Revolutionize Your Coding Workflow
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-900 p-6 rounded-lg">
              <FolderCodeIcon className="h-12 w-12 text-blue-500 mb-4" />
              <h3 className="text-xl text-white font-semibold mb-2">
                Whole-codebase Understanding
              </h3>
              <p className="text-gray-400">
                Ask for any change and Codebuff will find the relevant sections
                out of thousands of files.
              </p>
            </div>
            <div className="bg-gray-900 p-6 rounded-lg">
              <ZapIcon className="h-12 w-12 text-blue-500 mb-4" />
              <h3 className="text-xl text-white font-semibold mb-2">
                10x Your Dev Productivity
              </h3>
              <p className="text-gray-400">
                Get more done when using Codebuff to write features, debug
                tests, refactor files, and install packages.
              </p>
            </div>
            <div className="bg-gray-900 p-6 rounded-lg">
              <TerminalIcon className="h-12 w-12 text-blue-500 mb-4" />
              <h3 className="text-xl text-white font-semibold mb-2">
                Fully Capable Agent in Your Terminal
              </h3>
              <p className="text-gray-400">
                Codebuff can run terminal commands, create and edit files, and
                more.
              </p>
            </div>
          </div>
        </section>

        <section className="py-10 px-4 relative z-10 space-y-8">
          <h2 className="text-3xl md:text-4xl font-bold text-center px-4 md:px-0">
            Watch a Demo
          </h2>
          <div className="max-w-3xl mx-auto">
            <div className="aspect-w-16 aspect-h-full h-96">
              <Button
                onClick={() => setIsVideoOpen(true)}
                className="bg-gray-800 hover:bg-gray-700 rounded-lg shadow-lg p-0 h-full w-full ring-1 ring-gray-400/20"
              >
                <div className="relative w-full h-full">
                  <img
                    src="/video-thumbnail.jpg"
                    alt="Video thumbnail"
                    className="w-full h-full object-cover object-center rounded-lg"
                  />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="bg-gray-500 rounded-full p-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500">
                      <Play className="h-6 w-6 text-white" />
                    </div>
                  </div>
                </div>
              </Button>
            </div>
          </div>
          <Dialog open={isVideoOpen} onOpenChange={setIsVideoOpen}>
            <DialogContent className="max-w-3xl bg-transparent border-0 p-0">
              <div className="aspect-w-16 aspect-h-full h-96">
                <iframe
                  src="https://www.youtube.com/embed/dQ0NOMsu0dA"
                  title="Codebuff Demo"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full rounded-lg shadow-lg"
                ></iframe>
              </div>
            </DialogContent>
          </Dialog>
        </section>

        <section className="py-20 relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-center px-4 md:px-0">
            What Developers Are Saying
          </h2>

          <h6 className="text-center text-gray-700 dark:text-gray-300 text-sm mb-12">
            (note: some testimonials reference our previous name,
            &quot;Manicode&quot; – they refer to the same product)
          </h6>
          {testimonials.map((row, rowIndex) => (
            <Marquee
              key={rowIndex}
              className="py-4"
              pauseOnHover
              reverse={rowIndex % 2 === 1}
            >
              <div className="flex gap-4">
                {row.map((testimonial, i) => (
                  <ReviewCard key={i} t={testimonial} />
                ))}
              </div>
            </Marquee>
          ))}

          <div className="flex flex-col md:flex-row items-center justify-center md:space-x-8 space-y-8 md:space-y-0 pt-32">
            <div className="flex flex-col items-center">
              <p>Backed by</p>
              <Link
                target="_blank"
                href="https://www.ycombinator.com/companies/codebuff"
              >
                <img
                  src="/y-combinator.svg"
                  alt="y combinator logo"
                  className="h-8 w-full"
                />
              </Link>
            </div>
            <a
              href="https://www.producthunt.com/posts/codebuff?embed=true&utm_source=badge-featured&utm_medium=badge&utm_souce=badge-codebuff"
              target="_blank"
            >
              <img
                src={`https://api.producthunt.com/widgets/embed-image/v1/featured.svg?post_id=501055&theme=${theme ?? 'light'}`}
                alt="Codebuff - Better&#0032;code&#0032;generation&#0032;than&#0032;Cursor&#0044;&#0032;from&#0032;your&#0032;CLI | Product Hunt"
                width="250"
                height="54"
              />
            </a>
          </div>
        </section>

        <section className="py-20 relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 px-4 md:px-0">
            FAQ
          </h2>
          <div className="max-w-3xl mx-auto space-y-4 px-4">
            {faqs.map((item, index) => (
              <details key={index} open={openFaqIndex === index}>
                <summary
                  className="flex cursor-pointer font-bold w-full text-left p-4 text-gray-700 dark:text-gray-300 justify-between items-center marker:[font-size:0px] [&::-webkit-details-marker]:hidden"
                  onClick={(e) => {
                    e.preventDefault()
                    setOpenFaqIndex(openFaqIndex === index ? null : index)
                  }}
                >
                  {item.question}
                  {openFaqIndex === index ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </summary>
                <div className="text-gray-500 dark:text-white px-4 pb-4 items-center">
                  {item.answer}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="py-20 relative z-10">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 px-4 md:px-0">
            Try it yourself
          </h2>
          <div className="mb-16">
            <InteractiveTerminalDemo />
          </div>
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-12 px-4 md:px-0">
            Ready to experience magic?
          </h2>
          <div className="text-center">
            <Button className="bg-blue-900 hover:bg-blue-700 text-white transition-colors">
              <Link
                href="https://www.npmjs.com/package/codebuff"
                target="_blank"
              >
                Start Coding with AI
              </Link>
            </Button>
          </div>
        </section>
      </div>
    </div>
  )
}

export default Home
