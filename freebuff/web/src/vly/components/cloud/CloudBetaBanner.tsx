'use client'

import Link from 'next/link'
import { Cloud, MessageCircle } from 'lucide-react'

export function CloudBetaBanner({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`border-y border-forest-bright/20 bg-forest/10 text-white shadow-[0_1px_0_rgba(255,255,255,0.03)_inset] ${
        compact ? 'px-3 py-2' : 'rounded-xl border px-4 py-3'
      }`}
    >
      <div
        className={`mx-auto flex w-full items-start gap-3 ${
          compact ? 'max-w-none' : 'max-w-6xl'
        }`}
      >
        <span className="mt-0.5 flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-forest-bright/25 bg-forest-bright/10 text-forest-bright">
          <Cloud className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-white">
            Freebuff Cloud beta
          </div>
          <div className="mt-0.5 text-sm leading-5 text-white/65">
            Cloud is in beta. Report bugs and talk with us in{' '}
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
          </div>
        </div>
      </div>
    </div>
  )
}
