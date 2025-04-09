import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Icons } from '@/components/icons'
import { useToast } from '@/components/ui/use-toast'
import { loadStripe } from '@stripe/stripe-js'
import { env } from '@/env.mjs'
import { GrantType } from 'common/src/types/grant' // Assuming GrantType is usable

const stripePromise = loadStripe(env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY)

// Define credit packages
const creditPackages = [
  { credits: 500, price: 5.00, id: 'pkg_500' }, // Min 500 credits
  { credits: 1000, price: 10.00, id: 'pkg_1000' },
  { credits: 2500, price: 25.00, id: 'pkg_2500' },
  { credits: 5000, price: 45.00, id: 'pkg_5000' }, // Example discount
]

interface BuyCreditsModalProps {
  isOpen: boolean
  onClose: () => void
}

export function BuyCreditsModal({ isOpen, onClose }: BuyCreditsModalProps) {
  const [selectedPackageId, setSelectedPackageId] = useState<string | null>(creditPackages[0].id)
  const [isLoading, setIsLoading] = useState(false)
  const { toast } = useToast()

  const handlePurchase = async () => {
    if (!selectedPackageId) {
      toast({ title: 'Please select a credit package.', variant: 'destructive' })
      return
    }

    const selectedPackage = creditPackages.find(pkg => pkg.id === selectedPackageId)
    if (!selectedPackage) {
      toast({ title: 'Invalid package selected.', variant: 'destructive' })
      return
    }

    setIsLoading(true)

    try {
      // 1. Request Checkout Session from your backend
      const response = await fetch('/api/stripe/buy-credits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ credits: selectedPackage.credits }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to create checkout session.')
      }

      const { sessionId } = await response.json()

      // 2. Redirect to Stripe Checkout
      const stripe = await stripePromise
      if (!stripe) {
        throw new Error('Stripe.js failed to load.')
      }

      const { error } = await stripe.redirectToCheckout({ sessionId })

      if (error) {
        console.error('Stripe redirect error:', error)
        throw new Error(error.message || 'Failed to redirect to Stripe.')
      }
      // If redirectToCheckout succeeds, the user is redirected away,
      // so we don't need to set isLoading back to false here in the success case.

    } catch (error: any) {
      console.error('Purchase error:', error)
      toast({
        title: 'Purchase Failed',
        description: error.message || 'Could not initiate credit purchase.',
        variant: 'destructive',
      })
      setIsLoading(false) // Set loading false only on error
    }
    // No need to set isLoading false on success because of redirect
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Buy More Credits</DialogTitle>
          <DialogDescription>
            Select a package to top up your balance. Purchased credits do not expire.
            <span className="text-xs block mt-1"> (We reserve the right to change the expiration policy for credits purchased in the future).</span>
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <RadioGroup
            value={selectedPackageId ?? ''}
            onValueChange={setSelectedPackageId}
            className="space-y-2"
          >
            {creditPackages.map((pkg) => (
              <Label
                key={pkg.id}
                htmlFor={pkg.id}
                className="flex items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground [&:has([data-state=checked])]:border-primary"
              >
                <span>{pkg.credits.toLocaleString()} Credits</span>
                <span className="font-semibold">${pkg.price.toFixed(2)}</span>
                <RadioGroupItem value={pkg.id} id={pkg.id} className="sr-only" />
              </Label>
            ))}
          </RadioGroup>
           {/* Optionally add a custom amount input later */}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button onClick={handlePurchase} disabled={isLoading || !selectedPackageId}>
            {isLoading && <Icons.loader className="mr-2 size-4 animate-spin" />}
            Purchase Credits
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}