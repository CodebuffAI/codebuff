import Image from 'next/image'

import { cn } from '@/lib/utils'

import type { Author } from '@/lib/blog/types'

/**
 * Author avatar with sensible defaults.
 *
 * - If `author.avatar` points to a non-generic image, render it.
 * - Otherwise, generate a deterministic initials avatar with a per-author hue,
 *   so every author gets a distinct, brand-aligned look without us having to
 *   commission headshots for everyone.
 *
 * Deterministic = same `author.id` always produces the same gradient, so the
 * server-rendered HTML always matches the client (no hydration mismatch).
 */
interface AuthorAvatarProps {
  author: Author
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

const SIZE = {
  sm: { px: 24, text: 'text-[10px]' },
  md: { px: 32, text: 'text-xs' },
  lg: { px: 48, text: 'text-sm' },
} as const

// Generic / placeholder image paths that should be replaced with an initials avatar.
const GENERIC_AVATARS = new Set([
  '/logo-icon.png',
  '/logo-icon-black-bg.png',
  '/freebuff-icon.svg',
  '/favicon.svg',
  '/Placeholder.svg',
])

function initialsFor(name: string): string {
  return name
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !/^(the|a|an|of|and)$/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '·'
}

/**
 * Deterministic small hash so the same id always picks the same gradient.
 * (Math.random would cause hydration mismatches.)
 */
function hashId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0
  }
  return Math.abs(h)
}

// Curated palette of brand-friendly gradients (acid-matrix-tinted + neutrals).
// All values are static class strings so Tailwind's JIT picks them up.
const GRADIENTS = [
  'from-acid-matrix/40 to-emerald-700/40 text-acid-matrix',
  'from-emerald-500/35 to-teal-700/30 text-emerald-200',
  'from-lime-500/30 to-acid-matrix/25 text-lime-200',
  'from-zinc-500/30 to-zinc-800/40 text-zinc-100',
  'from-cyan-500/30 to-teal-700/30 text-cyan-200',
  'from-amber-500/25 to-orange-700/30 text-amber-200',
  'from-fuchsia-500/25 to-violet-700/30 text-fuchsia-200',
] as const

export function AuthorAvatar({
  author,
  size = 'md',
  className,
}: AuthorAvatarProps) {
  const { px, text } = SIZE[size]
  const useImage = author.avatar && !GENERIC_AVATARS.has(author.avatar)

  if (useImage) {
    return (
      <Image
        src={author.avatar!}
        alt={author.name}
        width={px}
        height={px}
        className={cn(
          'rounded-full bg-white/10 object-cover ring-1 ring-white/15',
          className,
        )}
        style={{ width: px, height: px }}
      />
    )
  }

  const gradient = GRADIENTS[hashId(author.id) % GRADIENTS.length]
  const initials = initialsFor(author.name)

  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold tracking-tight ring-1 ring-white/10',
        gradient,
        text,
        className,
      )}
      style={{ width: px, height: px }}
      aria-label={author.name}
    >
      {initials}
    </span>
  )
}
