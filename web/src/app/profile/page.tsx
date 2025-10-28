'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { CreditCard, Shield, Users, Key, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'

// Import components
import { SecuritySection } from './components/security-section'
import { ReferralsSection } from './components/referrals-section'
import { UsageSection } from './components/usage-section'
import { ApiKeysSection } from './components/api-keys-section'
import { ProfileLoggedOut } from './components/logged-out'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'

const sections = [
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
  {
    id: 'referrals',
    title: 'Referrals',
    icon: Users,
    component: ReferralsSection,
  },
]

function ProfileSidebar({
  activeSection,
  onSectionChange,
  onNavigate,
}: {
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
  const { status } = useSession()
  const searchParams = useSearchParams() ?? new URLSearchParams()
  const [activeSection, setActiveSection] = useState('usage')
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const tab = searchParams.get('tab')
    if (tab && sections.find((s) => s.id === tab)) {
      setActiveSection(tab)
    }
  }, [searchParams])

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
