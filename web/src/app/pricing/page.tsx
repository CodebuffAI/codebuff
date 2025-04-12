'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SignInCardFooter } from '@/components/sign-in/sign-in-card-footer'
import { useSession } from 'next-auth/react'
import { useIsMobile } from '@/hooks/use-mobile'

import {
  Loader2 as Loader,
  DollarSign,
  Zap,
  LineChart,
  Shield,
  Bell,
  BarChart,
  ArrowRight,
  Rocket,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'
import { Section } from '@/components/ui/section'
import { BackgroundBeams } from '@/components/ui/background-beams'
import { useRouter } from 'next/navigation'

function PricingCard() {
  const { status } = useSession()
  const router = useRouter()
  
  const handleUsageClick = () => {
    router.push('/usage')
  }

  return (
    <Card className="relative overflow-hidden border-2 max-w-sm mx-auto">
      <div className="absolute inset-0 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent pointer-events-none" />
      <CardHeader className="pb-4">
        <CardTitle className="text-center text-2xl">Start Free</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-center">
          <div className="text-4xl font-bold bg-gradient-to-r from-green-400 to-emerald-500 bg-clip-text text-transparent">
            500 credits
          </div>
          <div className="text-muted-foreground text-sm">
            Free credits every month
          </div>
        </div>

        <div className="text-center pt-2">
          <div className="text-xl font-semibold">Then Just</div>
          <div className="text-3xl font-bold bg-gradient-to-r from-primary via-primary/90 to-primary bg-clip-text text-transparent">
            1¢ per credit
          </div>
          <div className="text-muted-foreground text-sm">Pay as you go</div>
        </div>

        {status === 'authenticated' ? (
          <Button
            className="w-full bg-gradient-to-r from-primary/90 to-primary hover:from-primary hover:to-primary/90"
            size="default"
            onClick={handleUsageClick}
          >
            View Usage
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        ) : (
          <Button
            className="w-full bg-gradient-to-r from-primary/90 to-primary hover:from-primary hover:to-primary/90"
            size="default"
          >
            Get Started Free
            <Rocket className="ml-2 h-4 w-4" />
          </Button>
        )}

        <div className="text-center text-xs text-muted-foreground">
          All purchased credits never expire
        </div>
      </CardContent>
    </Card>
  )
}

function Features() {
  const items = [
    {
      icon: <DollarSign className="h-5 w-5" />,
      title: 'Pay Per Success',
      description: 'Only pay for successful changes',
    },
    {
      icon: <Shield className="h-5 w-5" />,
      title: 'Predictable Costs',
      description: 'No hidden fees or surprises',
    },
    {
      icon: <LineChart className="h-5 w-5" />,
      title: 'Real-time Balance',
      description: 'Monitor costs as you go',
    },
    {
      icon: <Bell className="h-5 w-5" />,
      title: 'Usage Alerts',
      description: 'Set notification thresholds',
    },
    {
      icon: <Zap className="h-5 w-5" />,
      title: 'Auto Top-up',
      description: 'Never run out of credits',
    },
    {
      icon: <BarChart className="h-5 w-5" />,
      title: 'Usage Analytics',
      description: 'Track spending patterns',
    },
  ]

  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-4xl mx-auto">
      {items.map((item, i) => (
        <motion.div
          key={item.title}
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: i * 0.1 }}
          viewport={{ once: true }}
          className="flex items-start gap-3 p-4 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
        >
          <div className="text-primary mt-1">{item.icon}</div>
          <div>
            <h3 className="font-medium">{item.title}</h3>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

export default function PricingPage() {
  const { status } = useSession()
  const isMobile = useIsMobile()

  if (status === 'loading') {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <Loader className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  if (status === 'unauthenticated') {
    return (
      <div className="container mx-auto py-6 px-4 sm:py-10 sm:px-6">
        <Card className="w-full max-w-md mx-auto">
          <CardHeader>
            <CardTitle>Sign in to get started</CardTitle>
          </CardHeader>
          <CardContent>
            <p>Please sign in to start using Codebuff.</p>
          </CardContent>
          <SignInCardFooter />
        </Card>
      </div>
    )
  }

  return (
    <Section className={cn('relative', isMobile ? 'pt-0' : 'py-6')}>
      <BackgroundBeams className="opacity-20" />
      <div className="relative z-10 space-y-16">
        <motion.div 
          className="text-center space-y-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight bg-gradient-to-r from-primary via-primary/90 to-primary bg-clip-text text-transparent">
            Pay Less, Get More
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Simple, transparent pricing with no monthly fees.
            <br />
            Only pay for what you use.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <PricingCard />
        </motion.div>

        <Features />
      </div>
    </Section>
  )
}
