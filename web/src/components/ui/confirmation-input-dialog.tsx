'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface ConfirmationInputDialogProps {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  title: string
  description: React.ReactNode
  confirmationText: string
  onConfirm: () => void
  isConfirming: boolean
  confirmButtonText: string
}

export function ConfirmationInputDialog({
  isOpen,
  onOpenChange,
  title,
  description,
  confirmationText,
  onConfirm,
  isConfirming,
  confirmButtonText,
}: ConfirmationInputDialogProps) {
  const [inputValue, setInputValue] = useState('')

  useEffect(() => {
    if (!isOpen) setInputValue('')
  }, [isOpen])

  const isConfirmationMatch = inputValue === confirmationText

  const handleConfirm = () => {
    if (isConfirmationMatch) {
      onConfirm()
    }
  }

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirmation-input">
            Please type{' '}
            <code className="bg-muted px-1 py-0.5 rounded text-sm font-mono">
              {confirmationText}
            </code>{' '}
            to confirm:
          </Label>
          <Input
            id="confirmation-input"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder={confirmationText}
            className="font-mono"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isConfirming}
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isConfirmationMatch || isConfirming}
            variant="destructive"
          >
            {isConfirming ? 'Processing...' : confirmButtonText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
