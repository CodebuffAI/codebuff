'use client'

import { Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

interface CopyIdButtonProps {
  agentId: string
}

export function CopyIdButton({ agentId }: CopyIdButtonProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(agentId)
    toast({
      description: `Agent ID copied to clipboard: "${agentId}"`,
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="flex items-center gap-2"
    >
      <Copy className="h-4 w-4" />
      Copy ID
    </Button>
  )
}
