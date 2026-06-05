import { ArrowRight, Check, CheckCircle2, Info, Quote, X } from 'lucide-react'
import Link from 'next/link'

import { cn } from '@/lib/utils'

import { InlineMd } from './inline-md'

import type { Block } from '@/lib/blog/types'

function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 80)
}

export function PostBody({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-7 text-zinc-300">
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </div>
  )
}

function Block({ block }: { block: Block }) {
  switch (block.type) {
    case 'lede':
      return (
        <p className="text-lg leading-relaxed text-white/90 md:text-xl">
          <InlineMd text={block.text} />
        </p>
      )
    case 'p':
      return (
        <p className="text-[17px] leading-[1.75] text-zinc-300">
          <InlineMd text={block.text} />
        </p>
      )
    case 'h2': {
      const id = block.id ?? slugifyHeading(block.text)
      return (
        <h2
          id={id}
          className="group mt-12 scroll-mt-32 font-serif text-2xl font-medium text-white md:text-3xl"
        >
          <a href={`#${id}`} className="no-underline">
            {block.text}
            <span className="ml-2 text-acid-matrix/0 transition-colors group-hover:text-acid-matrix/60">
              #
            </span>
          </a>
        </h2>
      )
    }
    case 'h3': {
      const id = block.id ?? slugifyHeading(block.text)
      return (
        <h3
          id={id}
          className="mt-8 scroll-mt-32 font-serif text-xl font-medium text-white md:text-2xl"
        >
          {block.text}
        </h3>
      )
    }
    case 'ul':
      return (
        <ul className="space-y-3 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[17px] leading-[1.7] text-zinc-300">
              <span className="mt-2.5 inline-block size-1.5 shrink-0 rounded-full bg-acid-matrix/70" />
              <span>
                <InlineMd text={item} />
              </span>
            </li>
          ))}
        </ul>
      )
    case 'ol':
      return (
        <ol className="space-y-3 pl-1">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3 text-[17px] leading-[1.7] text-zinc-300">
              <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-acid-matrix/30 bg-acid-matrix/10 font-mono text-xs text-acid-matrix">
                {i + 1}
              </span>
              <span>
                <InlineMd text={item} />
              </span>
            </li>
          ))}
        </ol>
      )
    case 'quote':
      return (
        <figure className="relative my-6 rounded-xl border border-white/10 bg-white/[0.03] p-6">
          <Quote className="absolute -top-3 left-6 size-6 text-acid-matrix/70" />
          <blockquote className="text-lg italic text-white/90">
            <InlineMd text={block.text} />
          </blockquote>
          {block.attribution && (
            <figcaption className="mt-3 text-sm text-zinc-400">
              — {block.attribution}
            </figcaption>
          )}
        </figure>
      )
    case 'callout': {
      const Icon =
        block.tone === 'warning' ? Info : block.tone === 'success' ? CheckCircle2 : Info
      const toneClasses =
        block.tone === 'warning'
          ? 'border-amber-500/30 bg-amber-500/[0.06] text-amber-200'
          : block.tone === 'success'
            ? 'border-acid-matrix/35 bg-acid-matrix/[0.06] text-acid-matrix'
            : 'border-white/15 bg-white/[0.04] text-white/80'
      return (
        <aside
          className={cn(
            'rounded-xl border p-5 md:p-6',
            toneClasses,
          )}
        >
          <div className="flex items-start gap-3">
            <Icon className="mt-0.5 size-5 shrink-0" />
            <div className="space-y-1.5">
              {block.title && (
                <p className="font-semibold text-white">{block.title}</p>
              )}
              <p className="text-[15px] leading-relaxed text-zinc-200">
                <InlineMd text={block.text} />
              </p>
            </div>
          </div>
        </aside>
      )
    }
    case 'code':
      return (
        <div className="space-y-2">
          <pre className="overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-5 text-sm leading-relaxed text-zinc-200">
            <code className="font-mono">{block.code}</code>
          </pre>
          {block.caption && (
            <p className="text-center text-xs text-zinc-500">{block.caption}</p>
          )}
        </div>
      )
    case 'cta':
      return (
        <div className="my-2 rounded-2xl border border-acid-matrix/30 bg-gradient-to-br from-acid-matrix/[0.08] to-transparent p-6 md:p-7">
          <h3 className="font-serif text-xl font-medium text-white md:text-2xl">
            {block.title}
          </h3>
          {block.description && (
            <p className="mt-2 text-zinc-300">{block.description}</p>
          )}
          <Link
            href={block.href}
            className="mt-5 inline-flex items-center gap-2 rounded-md bg-acid-matrix px-4 py-2.5 text-sm font-semibold text-black transition-all hover:shadow-[0_0_30px_rgba(124,255,63,0.35)]"
          >
            {block.label}
            <ArrowRight className="size-4" />
          </Link>
        </div>
      )
    case 'compare':
      return (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-white/[0.04]">
                <th className="border-b border-white/10 px-4 py-3 text-left font-semibold text-zinc-200">
                  Feature
                </th>
                <th className="border-b border-white/10 px-4 py-3 text-left font-semibold text-acid-matrix">
                  Freebuff
                </th>
                <th className="border-b border-white/10 px-4 py-3 text-left font-semibold text-zinc-300">
                  {block.competitor}
                </th>
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, i) => (
                <tr key={i} className="even:bg-white/[0.02]">
                  <td className="border-b border-white/5 px-4 py-3 align-top text-zinc-300">
                    <InlineMd text={row.feature} />
                  </td>
                  <td className="border-b border-white/5 px-4 py-3 align-top text-white/95">
                    <span className="inline-flex items-start gap-2">
                      <Check className="mt-1 size-4 shrink-0 text-acid-matrix" />
                      <span>
                        <InlineMd text={row.freebuff} />
                      </span>
                    </span>
                  </td>
                  <td className="border-b border-white/5 px-4 py-3 align-top text-zinc-400">
                    <span className="inline-flex items-start gap-2">
                      <X className="mt-1 size-4 shrink-0 text-zinc-600" />
                      <span>
                        <InlineMd text={row.competitor} />
                      </span>
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
    case 'tldr':
      return (
        <div className="rounded-xl border border-acid-matrix/25 bg-acid-matrix/[0.04] p-5 md:p-6">
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-acid-matrix">
            TL;DR
          </p>
          <ul className="space-y-2">
            {block.items.map((item, i) => (
              <li
                key={i}
                className="flex gap-3 text-[15px] leading-relaxed text-zinc-200"
              >
                <Check className="mt-1 size-4 shrink-0 text-acid-matrix" />
                <span>
                  <InlineMd text={item} />
                </span>
              </li>
            ))}
          </ul>
        </div>
      )
    case 'faq':
      return (
        <div className="space-y-4">
          {block.items.map((item, i) => (
            <details
              key={i}
              className="group rounded-xl border border-white/10 bg-white/[0.02] open:bg-white/[0.04]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 text-left text-white">
                <span className="font-semibold">{item.q}</span>
                <span className="text-acid-matrix transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <div className="px-5 pb-5 text-[15px] leading-relaxed text-zinc-300">
                <InlineMd text={item.a} />
              </div>
            </details>
          ))}
        </div>
      )
    case 'hr':
      return <hr className="my-2 border-white/10" />
    default:
      return null
  }
}
