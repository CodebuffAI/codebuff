'use client'

import { Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/use-toast'

interface SaveAgentButtonProps {
  agentId: string
}

export function SaveAgentButton({ agentId }: SaveAgentButtonProps) {
  const handleCopy = () => {
    navigator.clipboard.writeText(`codebuff save-agent ${agentId}`)
    toast({
      description: `Command copied! Go to your terminal and paste to save this agent to your project.`,
    })
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleCopy}
      className="flex items-center gap-2"
    >
      <Bookmark className="h-4 w-4" />
      Save this agent
    </Button>
  )
}
