'use client'

import { useState, useEffect } from 'react'
import posthog from 'posthog-js'
import Image from 'next/image'
import { useSearchParams } from 'next/navigation'
import {
  FolderCodeIcon,
  TerminalIcon,
  ZapIcon,
  Play,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import Link from 'next/link'
import { useTheme } from 'next-themes'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { BackgroundBeams } from '@/components/ui/background-beams'
import Marquee from '@/components/ui/marquee'
import { Testimonial, testimonials } from '@/lib/testimonials'
import { cn } from '@/lib/utils'
import { storeSearchParams } from '@/lib/trackConversions'
import { CodeDemo } from '@/components/docs/mdx/code-demo'
import TerminalDemo from '@/components/TerminalDemo'

const ReviewCard = ({
  t,
  onTestimonialClick,
}: {
  t: Testimonial
  onTestimonialClick: (author: string, link: string) => void
}) => {
  return (
    <figure
      className={cn(
        'relative w-64 lg:w-80 cursor-pointer overflow-hidden rounded-xl p-6',
        'bg-gradient-to-br from-white to-gray-50 hover:to-gray-100 border border-gray-200/50 shadow-lg hover:shadow-xl',
        'dark:from-gray-800 dark:to-gray-900 dark:hover:to-gray-800 dark:border-gray-700/50',
        'transition-all duration-200 hover:-translate-y-1'
      )}
      onClick={() => onTestimonialClick(t.author, t.link)}
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
            onClick={() => onTestimonialClick(t.author, t.link)}
          />
        </div>
      </div>
      <blockquote className="mt-4 text-sm lg:text-base">{t.quote}</blockquote>
    </figure>
  )
}

const InstallCommand = () => {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText('npm install -g codebuff')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="flex items-center gap-3 bg-gradient-to-r from-blue-500/5 to-purple-500/5 hover:from-blue-500/10 hover:to-purple-500/10 rounded-lg border border-blue-200/20 dark:border-blue-800/20 px-6 py-5 transition-all group">
      <code className="text-xl font-mono flex-1 select-all">
        npm install -g codebuff
      </code>
      <button
        onClick={copyToClipboard}
        className="p-2.5 hover:bg-white/10 rounded-md transition-all opacity-60 group-hover:opacity-100"
        aria-label={copied ? 'Copied!' : 'Copy command'}
      >
        {copied ? (
          <Check className="h-5 w-5 text-green-500" />
        ) : (
          <Copy className="h-5 w-5" />
        )}
      </button>
    </div>
  )
}

const Home = () => {
  const { theme } = useTheme()
  const [isVideoOpen, setIsVideoOpen] = useState(false)
  const [isInstallOpen, setIsInstallOpen] = useState(false)
  const searchParams = useSearchParams()

  const handleGetStartedClick = () => {
    posthog.capture('home.cta_clicked', {
      location: 'hero_section',
    })
    setIsInstallOpen(true)
  }

  const handleVideoOpen = () => {
    posthog.capture('home.video_opened')
    setIsVideoOpen(true)
  }

  const handleTestimonialClick = (author: string, link: string) => {
    posthog.capture('home.testimonial_clicked', {
      author,
      link,
    })
    window.open(link)
  }

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  return (
    <>
      <div className="relative overflow-hidden bg-gradient-to-b from-transparent via-blue-500/[0.02] to-blue-500/[0.03] dark:via-blue-900/[0.02] dark:to-blue-900/[0.03]">
        <BackgroundBeams className="z-0" />
        <div className="relative z-10 flex flex-col max-w-6xl mx-auto mt-8 mb-16 space-y-24">
          {/* Hero Section */}
          <section className="relative px-6 text-center">
            <h1 className="text-4xl md:text-7xl font-bold mb-6 text-blue-800">
              <span className="whitespace-nowrap">Upgrade your</span>{' '}
              <span className="whitespace-nowrap">coding agent</span>
            </h1>

            <p className="text-lg md:text-xl mb-8 text-muted-foreground max-w-2xl mx-auto">
              AI that understands your entire codebase. Run in your terminal or
              IDE!
            </p>

            <section className="text-center mb-12">
              <Button
                onClick={handleGetStartedClick}
                className="relative z-10 bg-gradient-to-r from-blue-600 to-blue-800 hover:from-blue-700 hover:to-blue-900 text-white text-lg py-6 px-8 transition-all duration-200 shadow-lg hover:shadow-xl hover:scale-105 transform"
              >
                Try For Free
              </Button>
            </section>

            <section className="relative w-full flex text-left">
              <TerminalDemo />
            </section>
          </section>

          {/* Features Section */}
          <section id="features" className="px-4 space-y-8">
            <h2 className="text-3xl md:text-4xl font-bold text-center px-4 md:px-0 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
              Revolutionize Your Coding Workflow
            </h2>
            <div className="grid md:grid-cols-3 gap-8">
              <div className="group bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-8 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1">
                <div className="bg-blue-100 dark:bg-blue-900/30 rounded-full w-16 h-16 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                  <FolderCodeIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="text-xl dark:text-white font-semibold mb-3">
                  Whole-codebase Understanding
                </h3>
                <p className="text-muted-foreground">
                  Ask for any change and Codebuff will find the relevant
                  sections out of thousands of files.
                </p>
              </div>
              <div className="group bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-8 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1">
                <div className="bg-purple-100 dark:bg-purple-900/30 rounded-full w-16 h-16 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                  <ZapIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="text-xl dark:text-white font-semibold mb-3">
                  10x Your Dev Productivity
                </h3>
                <p className="text-muted-foreground">
                  Get more done when using Codebuff to write features, debug
                  tests, refactor files, and install packages.
                </p>
              </div>
              <div className="group bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 p-8 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-1">
                <div className="bg-green-100 dark:bg-green-900/30 rounded-full w-16 h-16 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-200">
                  <TerminalIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="text-xl dark:text-white font-semibold mb-3">
                  Fully Capable Agent in Your Terminal
                </h3>
                <p className="text-muted-foreground">
                  Codebuff can run terminal commands, create and edit files, and
                  more.
                </p>
              </div>
            </div>
          </section>

          {/* Testimonials Section */}
          <section>
            <h2 className="text-3xl md:text-4xl font-bold text-center px-4 md:px-0 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
              What Developers Are Saying
            </h2>

            <h6 className="text-center text-gray-700 dark:text-gray-300 text-sm mb-12">
              (note: some testimonials reference our previous name,
              &quot;Manicode&quot; – they refer to the same product)
            </h6>
            <div className="mt-12 space-y-1">
              {testimonials.map((row, rowIndex) => (
                <Marquee
                  key={rowIndex}
                  className="py-6"
                  pauseOnHover
                  reverse={rowIndex % 2 === 1}
                >
                  <div className="flex gap-6">
                    {row.map((testimonial, i) => (
                      <ReviewCard
                        key={i}
                        t={testimonial}
                        onTestimonialClick={handleTestimonialClick}
                      />
                    ))}
                  </div>
                </Marquee>
              ))}
            </div>

            <div className="flex flex-col md:flex-row items-center justify-center md:space-x-12 space-y-8 md:space-y-0 mt-8">
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

          {/* Video Demo Section */}
          <section className="px-4">
            <h2 className="text-3xl md:text-4xl font-bold text-center px-4 md:px-0 bg-clip-text text-transparent bg-gradient-to-b from-foreground to-foreground/70">
              Watch a Demo
            </h2>
            <div className="max-w-3xl mx-auto mt-8">
              <div className="aspect-w-16 aspect-h-full h-96">
                <Button
                  onClick={handleVideoOpen}
                  className="bg-gray-800 hover:bg-gray-700 rounded-lg shadow-lg p-0 h-full w-full ring-1 ring-gray-400/20"
                >
                  <div className="relative w-full h-full">
                    <img
                      src="/video-thumbnail.jpg"
                      alt="Video thumbnail"
                      className="w-full h-full object-cover object-center rounded-lg"
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-red-500 rounded-full p-4">
                        <Play className="h-6 w-6 text-white" />
                      </div>
                    </div>
                  </div>
                </Button>
              </div>
            </div>
          </section>

          {/* CTA Section */}
          <section className="mb-16">
            <div className="max-w-4xl mx-auto text-center px-4 py-12">
              <h2 className="text-3xl md:text-4xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-br from-blue-600 via-blue-800 to-purple-700 dark:from-blue-400 dark:via-blue-600 dark:to-purple-500">
                Ready to experience magic?
              </h2>
              <p className="text-lg md:text-xl mb-12 text-muted-foreground">
                Start coding in less than a minute
              </p>

              <div className="max-w-sm mx-auto space-y-6">
                <InstallCommand />

                <div className="text-sm text-muted-foreground">
                  First time? Check out our{' '}
                  <Button
                    variant="link"
                    className="text-sm text-blue-500 hover:text-blue-400 p-0 h-auto"
                    onClick={() => {
                      posthog.capture('home.cta_clicked', {
                        location: 'cta_section',
                      })
                      setIsInstallOpen(true)
                    }}
                  >
                    step-by-step guide
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Dialogs */}
      <Dialog open={isInstallOpen} onOpenChange={setIsInstallOpen}>
        <DialogContent>
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Get Started with Codebuff</h2>
            <ol className="list-decimal list-inside space-y-6">
              <li>Open your favorite terminal.</li>
              <li>
                Install Codebuff globally via{' '}
                <Link
                  href="https://www.npmjs.com/package/codebuff"
                  target="_blank"
                  className="text-blue-500 hover:text-blue-400 underline"
                >
                  npm
                </Link>
                :
                <div className="mt-2">
                  <CodeDemo language="bash">npm install -g codebuff</CodeDemo>
                </div>
              </li>
              <li>
                Run Codebuff in a project directory:
                <div className="mt-2">
                  <CodeDemo language="bash">codebuff</CodeDemo>
                </div>
              </li>
            </ol>
          </div>
        </DialogContent>
      </Dialog>

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
    </>
  )
}

export default Home
