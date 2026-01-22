'use client'

import { DEFAULT_FREE_CREDITS_GRANT } from '@codebuff/common/old-constants'
import { Gift, Shield, Link2, Zap, Terminal } from 'lucide-react'
import { useSession } from 'next-auth/react'

import { BlockColor } from '@/components/ui/decorative-blocks'
import { SECTION_THEMES } from '@/components/ui/landing/constants'
import { FeatureSection } from '@/components/ui/landing/feature'

function CreditVisual() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex flex-col items-center space-y-4">
        <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-400 flex items-baseline">
          1¢
          <span className="text-xs sm:text-sm md:text-base text-white/70 ml-2">
            /credit
          </span>
        </div>
        <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-green-400/40 to-transparent"></div>

        {/* Grid with improved spacing for mobile and desktop */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:gap-x-16">
          <div className="flex flex-col items-center group">
            <div className="p-2 rounded-full bg-blue-500/10 mb-2">
              <Gift className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-blue-400">
              {DEFAULT_FREE_CREDITS_GRANT}
            </div>
            <div className="text-xs sm:text-sm text-white/70">Free monthly</div>
          </div>

          <div className="flex flex-col items-center group">
            <div className="p-2 rounded-full bg-purple-500/10 mb-2">
              <Shield className="h-5 w-5 text-purple-400" />
            </div>
            <div className="text-lg font-bold text-white">∞</div>
            <div className="text-xs sm:text-sm text-white/70">Never expire</div>
          </div>
        </div>
      </div>

      <div className="mt-8 text-sm text-white/90 max-w-sm border border-white/20 rounded-md p-3 bg-white/5">
        <span>
          {DEFAULT_FREE_CREDITS_GRANT} credits is typically enough for
        </span>{' '}
        <span>a few hours of intense coding on a new project</span>
      </div>
    </div>
  )
}

function PricingCard() {
  return (
    <div className="w-full h-full bg-black overflow-hidden flex flex-col">
      <div className="flex-1 p-6 sm:p-8 flex flex-col justify-center">
        <CreditVisual />
      </div>
    </div>
  )
}

function ClaudeSubscriptionIllustration() {
  return (
    <div className="flex flex-col items-center text-center">
      <div className="flex flex-col items-center space-y-6 w-full max-w-md">
        {/* Connection visual */}
        <div className="flex items-center justify-center gap-4 w-full">
          {/* Claude card */}
          <div className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg p-4 shadow-lg border border-orange-400/30">
            <div className="text-white font-bold text-sm">Claude</div>
            <div className="text-white/80 text-xs mt-1">Pro / Max</div>
          </div>

          {/* Connection arrow */}
          <div className="flex items-center">
            <div className="w-8 h-0.5 bg-gradient-to-r from-orange-400 to-green-400"></div>
            <Link2 className="h-5 w-5 text-green-400 mx-1" />
            <div className="w-8 h-0.5 bg-gradient-to-r from-green-400 to-green-500"></div>
          </div>

          {/* Codebuff card */}
          <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-lg p-4 shadow-lg border border-green-400/30">
            <div className="text-white font-bold text-sm">Codebuff</div>
            <div className="text-white/80 text-xs mt-1">CLI</div>
          </div>
        </div>

        {/* Benefits grid */}
        <div className="grid grid-cols-1 gap-3 w-full mt-4">
          <div className="flex items-center gap-3 bg-black/30 rounded-lg p-3 border border-white/10">
            <div className="p-2 rounded-full bg-green-500/20">
              <Zap className="h-4 w-4 text-green-400" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-white">Save on credits</div>
              <div className="text-xs text-white/60">Use your subscription for Claude model requests</div>
            </div>
          </div>

          <div className="flex items-center gap-3 bg-black/30 rounded-lg p-3 border border-white/10">
            <div className="p-2 rounded-full bg-blue-500/20">
              <Terminal className="h-4 w-4 text-blue-400" />
            </div>
            <div className="text-left">
              <div className="text-sm font-medium text-white">Simple CLI setup</div>
              <div className="text-xs text-white/60">Connect with one command</div>
            </div>
          </div>
        </div>

        {/* Code snippet */}
        <div className="w-full mt-2 bg-black/50 rounded-lg p-3 border border-white/10 font-mono text-left">
          <div className="text-green-400 text-xs">$ codebuff</div>
          <div className="text-white/70 text-xs mt-1">{'>'} /connect:claude</div>
          <div className="text-green-400/80 text-xs mt-1">✓ Connected to Claude subscription</div>
        </div>
      </div>
    </div>
  )
}

function TeamPlanIllustration() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6 w-full max-w-screen-lg mx-auto">
      {/* Team plan */}
      <div className="bg-white border border-zinc-200 rounded-lg p-4 sm:p-6 flex flex-col h-full shadow-lg">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-1">Team</h3>
          <div className="flex items-baseline">
            <span className="text-2xl sm:text-3xl font-bold text-gray-900">
              $19
            </span>
            <span className="text-sm sm:text-base text-gray-500 ml-1">
              /user/month
            </span>
          </div>
        </div>

        <ul className="space-y-2 sm:space-y-3 mb-auto">
          <li className="flex text-gray-700">
            <span className="text-green-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">
              Team management dashboard
            </span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-green-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Pooled credit usage</span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-green-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">
              Pay-as-you-go at 1¢ per credit
            </span>
          </li>
        </ul>

        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-gray-200">
          <a
            href="mailto:support@codebuff.com"
            className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm"
          >
            Reach out to support@codebuff.com
          </a>
        </div>
      </div>

      {/* Enterprise plan */}
      <div className="bg-gradient-to-b from-blue-50 to-white border border-blue-200 rounded-lg p-4 sm:p-6 flex flex-col h-full shadow-lg">
        <div className="mb-4">
          <h3 className="text-xl font-bold text-gray-900 mb-1">Enterprise</h3>
          <div className="text-sm sm:text-base text-gray-500">
            Custom Pricing
          </div>
        </div>

        <ul className="space-y-2 sm:space-y-3 mb-auto">
          <li className="flex text-gray-700">
            <span className="text-blue-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Everything in Team</span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-blue-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Dedicated support</span>
          </li>
          <li className="flex text-gray-700">
            <span className="text-blue-600 mr-2">✓</span>
            <span className="text-sm sm:text-base">Custom integrations</span>
          </li>
        </ul>

        <div className="mt-4 sm:mt-6 pt-3 sm:pt-4 border-t border-blue-100">
          <a
            href="mailto:founders@codebuff.com"
            className="text-blue-600 hover:text-blue-800 text-xs sm:text-sm"
          >
            Reach out to founders@codebuff.com
          </a>
        </div>
      </div>
    </div>
  )
}

export default function PricingClient() {
  const { status } = useSession()

  return (
    <>
      <FeatureSection
        title={<span>Simple, Usage-Based Pricing</span>}
        description="Get 500 free credits monthly, then pay just 1¢ per credit. Credits are consumed based on task complexity — simple queries cost less, complex changes more. You'll see how many credits each task consumes."
        backdropColor={SECTION_THEMES.competition.background}
        decorativeColors={[BlockColor.GenerativeGreen, BlockColor.AcidMatrix]}
        textColor="text-white"
        tagline="PAY AS YOU GO"
        highlightText="500 free credits monthly"
        illustration={<PricingCard />}
        learnMoreText={status === 'authenticated' ? 'My Usage' : 'Get Started'}
        learnMoreLink={status === 'authenticated' ? '/usage' : '/login'}
      />

      <FeatureSection
        title={<span>Connect Your Claude Subscription</span>}
        description="Already have a Claude Pro or Max subscription? Connect it to Codebuff and use your existing subscription for Claude model requests. Save credits while enjoying the full power of Claude through Codebuff's intelligent orchestration."
        backdropColor={BlockColor.DarkForestGreen}
        decorativeColors={[BlockColor.CRTAmber, BlockColor.BetweenGreen]}
        textColor="text-white"
        tagline="BRING YOUR OWN SUBSCRIPTION"
        highlightText="Use your Claude Pro or Max subscription"
        illustration={<ClaudeSubscriptionIllustration />}
        learnMoreText="View Documentation"
        learnMoreLink="/docs"
        imagePosition="left"
      />

      <FeatureSection
        title={<span>Working with others</span>}
        description="Collaborate with your team more closely using Codebuff by pooling credits and seeing usage analytics."
        backdropColor={BlockColor.CRTAmber}
        decorativeColors={[
          BlockColor.DarkForestGreen,
          BlockColor.GenerativeGreen,
        ]}
        textColor="text-black"
        tagline="SCALE UP YOUR TEAM"
        highlightText="Pooled resources and usage analytics"
        illustration={<TeamPlanIllustration />}
        learnMoreText="Contact Sales"
        learnMoreLink="mailto:founders@codebuff.com"
        imagePosition="left"
      />
    </>
  )
}
