'use client'

import { FormEvent, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { api } from '@/convex/_generated/api'
import { useMutation } from 'convex/react'
import { useSession } from 'next-auth/react'
import { Loader2, MessageCircle, Send } from 'lucide-react'
import { toast } from 'sonner'

type ProductDirection = 'combined' | 'separate' | 'unsure'

const OPTIONS: Array<{ value: ProductDirection; label: string }> = [
  { value: 'combined', label: 'Combine with Freebuff Web' },
  { value: 'separate', label: 'Keep it on its own' },
  { value: 'unsure', label: 'Not sure yet' },
]

export function CloudFeedbackSurvey() {
  const { data: session, status } = useSession()
  const submitSurvey = useMutation(api.cloud.feedback.submitCloudBetaSurvey)

  const defaultName = session?.user?.name ?? ''
  const defaultEmail = session?.user?.email ?? ''
  const [name, setName] = useState(defaultName)
  const [email, setEmail] = useState(defaultEmail)
  const [productDirection, setProductDirection] =
    useState<ProductDirection>('combined')
  const [improvement, setImprovement] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    setName(defaultName)
    setEmail(defaultEmail)
  }, [defaultEmail, defaultName])

  const canSubmit = useMemo(
    () =>
      status === 'authenticated' &&
      name.trim().length > 0 &&
      email.trim().length > 0 &&
      improvement.trim().length > 0 &&
      !isSubmitting,
    [email, improvement, isSubmitting, name, status],
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canSubmit) return

    try {
      setIsSubmitting(true)
      await submitSurvey({
        recordedName: name.trim(),
        recordedEmail: email.trim(),
        productDirection,
        improvement: improvement.trim(),
      })
      setSubmitted(true)
      setImprovement('')
      toast.success('Feedback submitted')
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Could not submit feedback'
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.035] p-4 shadow-2xl shadow-black/20 backdrop-blur-sm sm:p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">
            Cloud beta survey
          </h2>
          <p className="mt-1 text-sm text-white/55">
            Tell us where Cloud should go next.
          </p>
        </div>
        <Link
          href="https://discord.gg/yXG3w7wxfs"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 self-start rounded-full border border-white/10 px-3 py-1.5 text-sm text-white/70 transition-colors hover:border-forest-bright/35 hover:text-forest-bright"
        >
          <MessageCircle className="h-4 w-4" />
          Discord
        </Link>
      </div>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-white/40">
              Name
            </span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-forest-bright/45"
              placeholder="Your name"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-medium uppercase tracking-wide text-white/40">
              Email
            </span>
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-10 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-forest-bright/45"
              placeholder="you@example.com"
            />
          </label>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-xs font-medium uppercase tracking-wide text-white/40">
            Should this product be combined with Freebuff Web?
          </legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors ${
                  productDirection === option.value
                    ? 'border-forest-bright/45 bg-forest-bright/10 text-white'
                    : 'border-white/10 bg-black/20 text-white/65 hover:border-white/20 hover:text-white'
                }`}
              >
                <span>{option.label}</span>
                <input
                  type="radio"
                  name="productDirection"
                  value={option.value}
                  checked={productDirection === option.value}
                  onChange={() => setProductDirection(option.value)}
                  className="sr-only"
                />
              </label>
            ))}
          </div>
        </fieldset>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium uppercase tracking-wide text-white/40">
            What should be improved?
          </span>
          <textarea
            value={improvement}
            onChange={(event) => setImprovement(event.target.value)}
            rows={4}
            className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none transition-colors placeholder:text-white/25 focus:border-forest-bright/45"
            placeholder="Preview reliability, repo setup, agent behavior, UI..."
          />
        </label>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-white/40">
            {submitted ? 'Thanks. Your latest response was recorded.' : null}
          </p>
          <button
            type="submit"
            disabled={!canSubmit}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Submit
          </button>
        </div>
      </form>
    </section>
  )
}
