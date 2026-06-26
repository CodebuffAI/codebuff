'use client'

import { useState } from 'react'
import Link from 'next/link'
import { MessageCircle, MessageSquarePlus } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/vly/components/ui/dialog'
import { CloudFeedbackSurvey } from './CloudFeedbackSurvey'

/**
 * Tucked-away Cloud beta survey: a small trigger (meant to sit next to the
 * Discord link in the beta banner) that opens the feedback form in a popup, so
 * it never clutters the dashboard or workspace.
 */
export function CloudFeedbackDialog({
  triggerClassName,
}: {
  triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className={
            triggerClassName ??
            'inline-flex items-center gap-1 font-medium text-forest-bright transition-colors hover:text-white'
          }
        >
          <MessageSquarePlus className="h-3.5 w-3.5" />
          Share feedback
        </button>
      </DialogTrigger>
      <DialogContent className="border-white/10 bg-[#0c1410] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white">Cloud beta survey</DialogTitle>
          <DialogDescription className="text-white/55">
            Tell us where Cloud should go next — your answers are recorded with
            your account.
          </DialogDescription>
        </DialogHeader>

        <CloudFeedbackSurvey onSubmitted={() => setOpen(false)} />

        <p className="text-center text-xs text-white/45">
          Prefer to chat? Report bugs and talk with us in{' '}
          <Link
            href="https://discord.gg/yXG3w7wxfs"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-forest-bright hover:text-white"
          >
            Discord
            <MessageCircle className="h-3.5 w-3.5" />
          </Link>
          .
        </p>
      </DialogContent>
    </Dialog>
  )
}
