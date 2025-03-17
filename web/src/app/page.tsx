'use client'

import { useState, useEffect } from 'react'
import posthog from 'posthog-js'
import { useSearchParams } from 'next/navigation'
import { Hero } from '@/components/ui/hero'
import { FeatureSection } from '@/components/ui/feature-section'
import { CompetitionSection } from '@/components/ui/competition-section'
import { TestimonialsSection } from '@/components/ui/testimonials-section'
import { CTASection } from '@/components/ui/cta-section'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { CodeDemo } from '@/components/docs/mdx/code-demo'
import { storeSearchParams } from '@/lib/trackConversions'
import { BackgroundBeams } from '@/components/ui/background-beams'
import IDEDemo from '@/components/IDEDemo'

const Home = () => {
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

  useEffect(() => {
    storeSearchParams(searchParams)
  }, [searchParams])

  // Sample code for the feature sections
  const understandingCode = [
    "> Planning: analyzing codebase context",
    "Scanning project structure...",
    "Identified technology stack: React, TypeScript, Express",
    "Analyzing dependencies and import structure...",
    "Found 3 main components with 12 dependent modules",
    "> Planning complete:",
    "• Identified pattern in authentication flow",
    "• Detected potential memory leak in useEffect",
  ];

  const rightStuffCode = [
    "> Planning: project configuration",
    "Analyzing tech stack and configuration needs",
    "Recommended setup:",
    "• TypeScript with strict mode",
    "• ESLint with airbnb preset",
    "• Jest for unit testing",
    "• GitHub Actions CI/CD pipeline",
    "> Creating config files now..."
  ];

  const remembersCode = [
    "> Loading context from previous session",
    "Found 3 related projects in your workspace",
    "Last time you were working on:",
    "• Authentication flow in AuthContext.tsx",
    "• API integration with the payments service",
    "• Fixing the dropdown component styles",
    "> Restoring your workflow context..."
  ];

  return (
    <div className="relative overflow-hidden">
      <BackgroundBeams className="z-0 opacity-50 animate-pulse" />
      <div className="relative z-10">
        {/* Hero Section */}
        <section className="full-width-section">
          <div className="codebuff-container">
            <Hero />
            <div className="terminal-demo-section">
              <IDEDemo />
            </div>
          </div>
        </section>

        {/* Feature Section 1: Full Codebase Understanding */}
        <section className="full-width-section">
          <FeatureSection
            title="Full Codebase Understanding"
            description="With AI that deeply understands your entire codebase, Codebuff helps you tackle challenging development problems. Whether you're debugging, developing, or exploring new code, Codebuff is there to provide insights and solutions tailored to your context."
            bgColor="yellow"
            codeSample={understandingCode}
            featureTag="FEATURE ONE"
          />
        </section>

        {/* Feature Section 2: Does the Right Stuff for Your Project */}
        <section className="full-width-section">
          <FeatureSection
            title="Does the Right Stuff for Your Project"
            description="Codebuff intelligently configures & scaffolds new technologies, provides detailed explanations built for you. With its advanced AI algorithms, Codebuff can analyze your projects, understand your workflows, and provide customized solutions."
            bgColor="dark"
            imagePosition="left"
            codeSample={rightStuffCode}
            featureTag="FEATURE TWO"
          />
        </section>

        {/* Feature Section 3: Remembers for Next Time */}
        <section className="full-width-section">
          <FeatureSection
            title="Remembers for Next Time"
            description="With its advanced AI algorithms, Codebuff can analyze your projects, understand your workflows, and provide customized solutions. Whether you're debugging, developing, or exploring new code, Codebuff is there to provide insights and solutions."
            bgColor="dark"
            codeSample={remembersCode}
            featureTag="FEATURE THREE"
          />
        </section>

        {/* Competition Section */}
        <section className="full-width-section">
          <CompetitionSection />
        </section>

        {/* Testimonials Section */}
        <section className="full-width-section">
          <TestimonialsSection />
        </section>

        {/* CTA Section */}
        <section className="full-width-section">
          <CTASection />
        </section>
      </div>

      {/* Dialogs */}
      <Dialog open={isInstallOpen} onOpenChange={setIsInstallOpen}>
        <DialogContent>
          <div className="space-y-6">
            <h2 className="text-2xl font-bold">Get Started with Codebuff</h2>
            <ol className="list-decimal list-inside space-y-6">
              <li>Open your favorite terminal.</li>
              <li>
                Install Codebuff globally via npm:
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
    </div>
  )
}

export default Home
