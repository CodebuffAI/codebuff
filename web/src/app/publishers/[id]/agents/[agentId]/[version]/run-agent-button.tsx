'use client'

import { Play } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

interface RunAgentButtonProps {
  agentId: string
}

export function RunAgentButton({ agentId }: RunAgentButtonProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(`codebuff --agent ${agentId}`)
    toast({
      description: `Command copied! Go to your terminal and paste to run this agent.`,
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="flex items-center gap-2"
    >
      <Play className="h-4 w-4" />
      Run this agent
    </Button>
  )
}
