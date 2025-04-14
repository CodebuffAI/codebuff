'use client'

import { useSession } from 'next-auth/react'
import { BlockColor } from '@/components/ui/decorative-blocks'
import { SECTION_THEMES } from '@/components/ui/landing/constants'
import { FeatureSection } from '@/components/ui/landing/feature'

import { CheckCircle, Gift, Shield, XCircle } from 'lucide-react'

function CreditVisual() {
  return (
    <div className="flex flex-col items-center text-center space-y-4 mt-3">
      <div className="flex flex-col items-center">
        {/* Enhanced price display for better visual appeal */}
        <div className="text-4xl sm:text-5xl md:text-6xl font-bold text-green-400 flex items-baseline">
          1¢
          <span className="text-xs sm:text-sm md:text-base text-white/70 ml-2">
            /credit
          </span>
        </div>
        <div className="w-24 h-[1px] bg-gradient-to-r from-transparent via-green-400/40 to-transparent my-4"></div>

        {/* Grid with improved spacing for mobile and desktop */}
        <div className="grid grid-cols-2 gap-x-10 gap-y-6 sm:gap-x-16">
          <div className="flex flex-col items-center group">
            <div className="p-2 rounded-full bg-blue-500/10 mb-2">
              <Gift className="h-5 w-5 text-blue-400" />
            </div>
            <div className="text-lg font-bold text-blue-400">500</div>
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
    </div>
  )
}

function PricingCard() {
  return (
    <div className="w-full bg-black overflow-hidden flex flex-col h-full">
      <div className="p-6 sm:p-8 flex flex-col">
        <CreditVisual />
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

export default function PricingPage() {
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
        keyPoints={[
          {
            icon: '💰',
            title: 'Predictable Costs',
            description:
              'Only pay for what you actually use. No surprises at the end of the month.',
          },
          {
            icon: '🔄',
            title: 'Monthly Free Credits',
            description:
              'Get 500 free credits each month, automatically added to your account.',
          },
          {
            icon: '🛡️',
            title: 'No Failed Call Charges',
            description:
              'Only pay for successful API calls. Failed calls cost nothing.',
          },
        ]}
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
        keyPoints={[
          {
            icon: '👥',
            title: 'Team Dashboard',
            description:
              "Manage your entire team's usage from a centralized dashboard.",
          },
          {
            icon: '🔋',
            title: 'Pooled Credits',
            description:
              'Share credits across your organization for maximum flexibility.',
          },
          {
            icon: '💼',
            title: 'Enterprise Options',
            description:
              'Custom integrations and dedicated support available for larger teams.',
          },
        ]}
      />
    </>
  )
}
