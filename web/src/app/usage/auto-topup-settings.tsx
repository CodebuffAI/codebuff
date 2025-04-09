'use client'

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '@/components/ui/use-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Info } from 'lucide-react'
import { UserProfile } from '@/types/user'

interface AutoTopupSettingsProps {
  initialSettings: Partial<Pick<UserProfile, 'auto_topup_enabled' | 'auto_topup_threshold' | 'auto_topup_target_balance'>>
}

export function AutoTopupSettings({ initialSettings }: AutoTopupSettingsProps) {
  const queryClient = useQueryClient()
  const [isEnabled, setIsEnabled] = useState(initialSettings.auto_topup_enabled ?? false)
  const [threshold, setThreshold] = useState(initialSettings.auto_topup_threshold ?? 500)
  const [targetBalance, setTargetBalance] = useState(initialSettings.auto_topup_target_balance ?? 2000)

  const mutation = useMutation({
    mutationFn: async (settings: Partial<UserProfile>) => {
      const response = await fetch('/api/user/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update settings')
      }
      return response.json()
    },
    onSuccess: () => {
      toast({ title: 'Auto Top-up settings saved successfully!' })
      queryClient.invalidateQueries({ queryKey: ['userProfile'] })
    },
    onError: (error: Error) => {
      toast({
        title: 'Error saving settings',
        description: error.message,
        variant: 'destructive',
      })
    },
  })

  const handleSave = () => {
    if (isEnabled && (threshold <= 0 || targetBalance <= 0)) {
      toast({ title: "Invalid Values", description: "Threshold and Target Balance must be positive numbers.", variant: "destructive" });
      return;
    }
    if (isEnabled && targetBalance <= threshold) {
      toast({ title: "Invalid Values", description: "Target Balance must be greater than the Threshold.", variant: "destructive" });
      return;
    }

    const settingsToUpdate = {
      auto_topup_enabled: isEnabled,
      auto_topup_threshold: isEnabled ? threshold : null,
      auto_topup_target_balance: isEnabled ? targetBalance : null,
    }

    mutation.mutate(settingsToUpdate)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Automatic Credit Top-up</CardTitle>
        <CardDescription>
          Automatically purchase credits when your balance falls below a certain threshold.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center space-x-2">
          <Switch
            id="auto-topup-enabled"
            checked={isEnabled}
            onCheckedChange={setIsEnabled}
            aria-label="Enable Auto Top-up"
          />
          <Label htmlFor="auto-topup-enabled">Enable Auto Top-up</Label>
        </div>

        {isEnabled && (
          <div className="space-y-4 pl-8 border-l-2 border-muted ml-2 pt-2">
             <div className="space-y-2">
               <Label htmlFor="threshold" className="flex items-center">
                 Low Balance Threshold (Credits)
                 <TooltipProvider>
                   <Tooltip>
                     <TooltipTrigger asChild>
                       <Info className="h-4 w-4 ml-1 text-muted-foreground cursor-help" />
                     </TooltipTrigger>
                     <TooltipContent>
                       <p>When your balance drops below this amount, we'll automatically top it up.</p>
                     </TooltipContent>
                   </Tooltip>
                 </TooltipProvider>
               </Label>
               <Input
                 id="threshold"
                 type="number"
                 value={threshold}
                 onChange={(e) => setThreshold(Number(e.target.value))}
                 placeholder="e.g., 500"
                 min="1"
               />
             </div>
             <div className="space-y-2">
               <Label htmlFor="targetBalance" className="flex items-center">
                 Top-up Target Balance (Credits)
                 <TooltipProvider>
                    <Tooltip>
                        <TooltipTrigger asChild>
                            <Info className="h-4 w-4 ml-1 text-muted-foreground cursor-help" />
                        </TooltipTrigger>
                        <TooltipContent>
                            <p>We'll purchase enough credits to bring your balance back up to this amount.</p>
                        </TooltipContent>
                    </Tooltip>
                 </TooltipProvider>
               </Label>
               <Input
                 id="targetBalance"
                 type="number"
                 value={targetBalance}
                 onChange={(e) => setTargetBalance(Number(e.target.value))}
                 placeholder="e.g., 2000"
                 min="1"
               />
             </div>
            <p className="text-xs text-muted-foreground">
                Ensure you have a valid payment method saved in Stripe. Auto top-up uses your default payment method.
            </p>
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={mutation.isPending}>
          {mutation.isPending ? 'Saving...' : 'Save Settings'}
        </Button>
      </CardFooter>
    </Card>
  )
}