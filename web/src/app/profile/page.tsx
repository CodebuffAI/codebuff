'use client'

import { useQuery } from '@tanstack/react-query'
import { CreditCard, Shield, Users, Key, Menu, User } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { useState, useEffect, Suspense } from 'react'


// Import components
import { AccountSection } from './components/account-section'
import { ApiKeysSection } from './components/api-keys-section'
import { ProfileLoggedOut } from './components/logged-out'
import { ReferralsSection } from './components/referrals-section'
import { SecuritySection } from './components/security-section'
import { UsageSection } from './components/usage-section'

import type { ReferralData } from '@/app/api/referrals/route'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { toast } from '@/components/ui/use-toast'

type Section = {
  id: string
  title: string
  icon: typeof CreditCard
  component: React.ComponentType
}

const REFERRALS_SECTION: Section = {
  id: 'referrals',
  title: 'Referrals',
  icon: Users,
  component: ReferralsSection,
}

function buildSections(hasReferralHistory: boolean): Section[] {
  return [
    {
      id: 'usage',
      title: 'Usage & Credits',
      icon: CreditCard,
      component: UsageSection,
    },
    {
      id: 'security',
      title: 'Security',
      icon: Shield,
      component: SecuritySection,
    },
    {
      id: 'api-keys',
      title: 'API Keys',
      icon: Key,
      component: ApiKeysSection,
    },
    ...(hasReferralHistory ? [REFERRALS_SECTION] : []),
    {
      id: 'account',
      title: 'Account',
      icon: User,
      component: AccountSection,
    },
  ]
}

function ProfileSidebar({
  sections,
  activeSection,
  onSectionChange,
  onNavigate,
}: {
  sections: Section[]
  activeSection: string
  onSectionChange: (section: string) => void
  onNavigate?: () => void
}) {
  return (
    <nav className="space-y-2">
      {sections.map((section) => {
        const Icon = section.icon
        return (
          <button
            key={section.id}
            onClick={() => {
              onSectionChange(section.id)
              onNavigate?.()
            }}
            className={cn(
              'w-full flex items-center gap-3 px-3 py-2 hover:bg-accent rounded-md transition-all text-sm font-medium text-left',
              activeSection === section.id &&
                'bg-accent text-accent-foreground',
            )}
          >
            <Icon className="h-4 w-4" />
            {section.title}
          </button>
        )
      })}
    </nav>
  )
}

function ProfilePageContent() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const [activeSection, setActiveSection] = useState('usage')
  const [open, setOpen] = useState(false)

  const { data: referralData } = useQuery<ReferralData>({
    queryKey: ['referrals'],
    queryFn: async () => {
      const response = await fetch('/api/referrals')
      const ret = await response.json()
      if (!response.ok) {
        throw new Error(`Failed to fetch referral data: ${ret.error}`)
      }
      return ret
    },
    enabled: !!session?.user,
  })
  const hasReferralHistory =
    !!referralData?.referredBy || (referralData?.referrals.length ?? 0) > 0
  const sections = buildSections(hasReferralHistory)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && sections.find((s) => s.id === tab)) {
      setActiveSection(tab)
    }
  }, [searchParams, sections])

  // Check for subscription success
  useEffect(() => {
    if (searchParams.get('subscription_success') === 'true') {
      toast({
        title: 'Welcome to Codebuff Strong! 🎉',
        description:
          'Thanks for subscribing! Your subscription is now active.',
      })
      // Clean up the URL while preserving the tab
      router.replace('/profile?tab=usage', { scroll: false })
    }
  }, [searchParams, router])

  const ActiveComponent =
    sections.find((s) => s.id === activeSection)?.component || UsageSection
  const activeTitle =
    sections.find((s) => s.id === activeSection)?.title || 'Profile'

  const handleSectionChange = (sectionId: string) => {
    setActiveSection(sectionId)
    // Update URL without page reload
    const url = new URL(window.location.href)
    url.searchParams.set('tab', sectionId)
    window.history.replaceState({}, '', url.toString())
  }

  // Loading state
  if (status === 'loading') {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-center">
          <div className="w-full max-w-2xl space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-64 w-full" />
          </div>
        </div>
      </div>
    )
  }

  // Unauthenticated state
  if (status === 'unauthenticated') {
    return <ProfileLoggedOut />
  }

  // Authenticated state - render normal profile content
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex gap-8">
        <div className="hidden lg:block w-64 shrink-0">
          <div className="sticky top-8">
            <div className="bg-background/95 backdrop-blur-sm rounded-lg border border-border/50 shadow-lg p-6">
              <div className="mb-6">
                <h1 className="text-xl font-semibold">Profile</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  Manage your account settings
                </p>
              </div>
              <ProfileSidebar
                sections={sections}
                activeSection={activeSection}
                onSectionChange={handleSectionChange}
                onNavigate={() => setOpen(false)}
              />
            </div>
          </div>
        </div>
        <main className="flex-1 min-w-0 pb-20 lg:pb-0">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold">{activeTitle}</h1>
          </div>
          <ActiveComponent />
        </main>
      </div>

      {/* Mobile navigation */}
      <div className="flex items-center lg:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-sm container p-4 rounded-t-lg border-t transition-all duration-300 ease-in-out transform translate-y-0">
        <Sheet
          open={open}
          onOpenChange={(isOpen) => {
            setOpen(isOpen)
            if (!open) {
              document.body.style.position = ''
              document.body.style.overflow = ''
              document.body.style.top = ''
            }
          }}
        >
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="mr-4">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="h-[80vh] p-6 pt-12 overflow-y-auto"
          >
            <div className="mb-6">
              <h1 className="text-xl font-semibold">Profile</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Manage your account settings
              </p>
            </div>
            <ProfileSidebar
              sections={sections}
              activeSection={activeSection}
              onSectionChange={handleSectionChange}
              onNavigate={() => setOpen(false)}
            />
          </SheetContent>
          <SheetTrigger asChild>
            <h1 className="text-xl font-semibold w-full">{activeTitle}</h1>
          </SheetTrigger>
        </Sheet>
      </div>
    </div>
  )
}

export default function ProfilePage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-center">
            <div className="w-full max-w-2xl space-y-4">
              <div className="h-8 w-64 bg-muted animate-pulse rounded" />
              <div className="h-4 w-96 bg-muted animate-pulse rounded" />
              <div className="h-64 w-full bg-muted animate-pulse rounded" />
            </div>
          </div>
        </div>
      }
    >
      <ProfilePageContent />
    </Suspense>
  )
}
