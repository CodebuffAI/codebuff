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
import IDEDemo from '@/components/IDEDemo'
import { DecorativeBlocks, BlockColor } from '@/components/ui/decorative-blocks'

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
    '> codebuff "find memory leaks in our React components"',
    'Analyzing codebase structure...',
    'Scanning 246 files and dependencies...',
    'Found 18 React components with potential issues',
    'Memory leak detected in UserDashboard.tsx:',
    '• Line 42: useEffect missing cleanup function',
    '• Line 87: Event listener not removed on unmount',
    '> Would you like me to fix these issues?',
    'Yes, fix all memory leaks',
    '> Applied precise fixes to 7 components',
    '• All memory leaks resolved correctly',
  ]

  const rightStuffCode = [
    '> codebuff "set up TypeScript with Next.js"',
    'Analyzing project needs and best practices...',
    'Creating config files with optimized settings:',
    '• tsconfig.json with strict type checking',
    '• ESLint configuration with NextJS ruleset',
    '• Tailwind CSS with TypeScript types',
    '• Husky pre-commit hooks for code quality',
    '> Setup complete. Testing build...',
    'Build successful - project ready for development',
  ]

  const remembersCode = [
    '> codebuff',
    'Welcome back! Loading your context...',
    'Found knowledge.md files in 3 projects',
    'Last session (2 days ago), you were:',
    '• Implementing authentication with JWT',
    '• Refactoring the API client for better error handling',
    '• Working on optimizing database queries',
    '> How would you like to continue?',
    'Continue with the API client refactoring',
    '> Retrieving context from previous work...',
  ]

  return (
    <div className="relative overflow-hidden">
      <div className="relative z-10">
        {/* Hero Section - Dark Green */}
        <section className="full-width-section">
          <div className="codebuff-container">
            <Hero />
            <DecorativeBlocks
              colors={[
                BlockColor.DarkForestGreen,
                BlockColor.GenerativeGreen,
                BlockColor.CRTAmber,
              ]}
              initialPlacement="bottom-right"
            >
              <IDEDemo />
            </DecorativeBlocks>
          </div>
        </section>

        {/* Feature Section 1 - Yellow */}
        <section className="full-width-section">
          <FeatureSection
            title="Full Codebase Understanding"
            description="Codebuff deeply understands your entire codebase structure, dependencies, and patterns to provide intelligent context-aware assistance that other AI tools can't match."
            backdropColor={BlockColor.TerminalYellow}
            decorativeColors={[BlockColor.CRTAmber, BlockColor.DarkForestGreen]}
            codeSample={understandingCode}
            tagline="DEEP PROJECT ANALYSIS & INSIGHTS"
            highlightText="4x faster than other AI coding assistants with deep codebase comprehension"
            keyPoints={[
              {
                icon: "🧠",
                title: "Complete Codebase Context",
                description: "Analyzes your entire project to understand its architecture and how components interact"
              },
              {
                icon: "🔍",
                title: "Precise Problem Identification",
                description: "Quickly identifies bugs, vulnerabilities, and optimization opportunities"
              },
              {
                icon: "⚡",
                title: "Smarter Suggestions",
                description: "Delivers code recommendations that align with your project's patterns and standards"
              }
            ]}
            illustration={{
              type: 'workflow',
              workflowSteps: [
                {
                  icon: "📁",
                  title: "Scan Codebase",
                  description: "Automatically analyzes all files, dependencies, and imports"
                },
                {
                  icon: "🔍",
                  title: "Build Context Map",
                  description: "Creates a comprehensive project graph with relationships"
                },
                {
                  icon: "🧠",
                  title: "Apply Intelligence",
                  description: "Uses deep understanding to provide context-aware assistance"
                },
                {
                  icon: "⚡",
                  title: "Deliver Results",
                  description: "Provides precise, targeted solutions 4x faster than competitors"
                }
              ]
            }}
          />
        </section>

        {/* Feature Section 2 - Black */}
        <section className="full-width-section">
          <FeatureSection
            title="Does the Right Stuff for Your Project"
            description="Codebuff intelligently handles project configuration, provides precise code edits, and integrates seamlessly with any technology stack without complex setup or environment restrictions."
            backdropColor={BlockColor.Black}
            decorativeColors={[
              BlockColor.AcidMatrix,
              BlockColor.TerminalYellow,
            ]}
            imagePosition="left"
            codeSample={rightStuffCode}
            tagline="INTELLIGENT PROJECT ASSISTANCE"
            highlightText="Works in any terminal with 50% lower CPU usage than competitors"
            keyPoints={[
              {
                icon: "🛠️",
                title: "Intelligent Configuration",
                description: "Sets up project scaffolding, dependencies, and configurations tailored to your needs"
              },
              {
                icon: "✂️",
                title: "Precise Code Edits",
                description: "Makes targeted changes instead of rewriting entire files, preserving your code's integrity"
              },
              {
                icon: "🔄",
                title: "Seamless Integration",
                description: "Works with any technology stack or framework without environment restrictions"
              }
            ]}
            illustration={{
              type: 'comparison',
              comparisonData: {
                beforeLabel: "Other AI Tools",
                afterLabel: "Codebuff",
                beforeMetrics: [
                  { label: "CPU Usage", value: "80-90%" },
                  { label: "Memory Usage", value: "1.2+ GB" },
                  { label: "Environment", value: "Limited" },
                  { label: "Editing Style", value: "Rewrite Files" }
                ],
                afterMetrics: [
                  { label: "CPU Usage", value: "30-40%" },
                  { label: "Memory Usage", value: "650 MB" },
                  { label: "Environment", value: "Universal" },
                  { label: "Editing Style", value: "Precise Edits" }
                ]
              }
            }}
          />
        </section>

        {/* Feature Section 3 - Yellow */}
        <section className="full-width-section">
          <FeatureSection
            title="Remembers Everything Between Sessions"
            description="Codebuff maintains knowledge about your projects, preferences, and previous interactions, creating a continuous experience that gets smarter and more efficient over time."
            backdropColor={BlockColor.TerminalYellow}
            decorativeColors={[BlockColor.GenerativeGreen, BlockColor.CRTAmber]}
            codeSample={remembersCode}
            tagline="CONTINUOUS LEARNING & OPTIMIZATION"
            highlightText="Saves your context in knowledge files that persist between sessions"
            keyPoints={[
              {
                icon: "🧩",
                title: "Persistent Context",
                description: "Maintains project-specific knowledge in knowledge.md files that persists between sessions"
              },
              {
                icon: "📈",
                title: "Adaptive Workflows",
                description: "Learns your coding style and preferences to provide increasingly personalized assistance"
              },
              {
                icon: "⏱️",
                title: "Time-Saving Recall",
                description: "Instantly recalls previous solutions and decisions to avoid repetitive explanations"
              }
            ]}
            illustration={{
              type: 'chart',
              chartData: {
                labels: ["Time to Context", "Assistance Quality", "Repeat Tasks", "Project Recall"],
                values: [95, 85, 90, 100],
                colors: [
                  "bg-gradient-to-r from-green-500 to-green-300", 
                  "bg-gradient-to-r from-green-500 to-green-300",
                  "bg-gradient-to-r from-green-500 to-green-300",
                  "bg-gradient-to-r from-green-500 to-green-300"
                ]
              }
            }}
          />
        </section>

        {/* Competition Section - Black */}
        <section className="full-width-section">
          <CompetitionSection />
        </section>

        {/* Testimonials Section - Yellow */}
        <section className="full-width-section">
          <TestimonialsSection />
        </section>

        {/* CTA Section - Black */}
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
