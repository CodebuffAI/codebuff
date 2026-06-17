import { useMemo, useState } from 'react'

import { cn } from '@/lib/utils'

/**
 * Renders a competitor's real brand logo in its original colors. Uses the
 * site favicon first (full-color, always legible on dark), then a colored
 * Simple Icon, and finally a lettermark tile if both are unavailable.
 */
export function BrandLogo({
  name,
  mark,
  slug,
  domain,
  logo,
  size = 22,
  className,
}: {
  name: string
  mark: string
  slug?: string
  domain?: string
  logo?: string
  size?: number
  className?: string
}) {
  const sources = useMemo(() => {
    const list: string[] = []
    if (logo) list.push(logo)
    if (domain)
      list.push(`https://www.google.com/s2/favicons?domain=${domain}&sz=128`)
    if (slug) list.push(`https://cdn.simpleicons.org/${slug}`)
    return list
  }, [slug, domain, logo])

  const [idx, setIdx] = useState(0)
  const src = sources[idx]

  if (src) {
    return (
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        draggable={false}
        onError={() => setIdx((i) => i + 1)}
        className={cn('shrink-0 rounded-[5px] object-contain', className)}
        style={{ width: size, height: size }}
      />
    )
  }

  return (
    <span
      aria-label={name}
      className={cn(
        'flex shrink-0 items-center justify-center rounded-[6px] bg-white/10 font-medium leading-none text-white',
        className,
      )}
      style={{ width: size, height: size, fontSize: size * 0.5 }}
    >
      {mark}
    </span>
  )
}
