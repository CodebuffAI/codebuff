'use client'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle, Users, GitBranch, CreditCard, BarChart3 } from 'lucide-react'

interface OrganizationSuccessModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizationName: string
  onContinue: () => void
}

export function OrganizationSuccessModal({
  open,
  onOpenChange,
  organizationName,
  onContinue,
}: OrganizationSuccessModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center text-green-600">
            <CheckCircle className="mr-2 h-5 w-5" />
            Organization Created!
          </DialogTitle>
          <DialogDescription>
            <strong>{organizationName}</strong> has been successfully created.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <h4 className="font-medium mb-3">What's next?</h4>
            <div className="space-y-3 text-sm text-muted-foreground">
              <div className="flex items-start gap-3">
                <Users className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>Invite team members to join your organization</span>
              </div>
              <div className="flex items-start gap-3">
                <GitBranch className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>Associate repositories with the organization</span>
              </div>
              <div className="flex items-start gap-3">
                <CreditCard className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>Purchase credits for the organization</span>
              </div>
              <div className="flex items-start gap-3">
                <BarChart3 className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                <span>Monitor usage and billing</span>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button onClick={onContinue} className="w-full">
            Get Started
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
