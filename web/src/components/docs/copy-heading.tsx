'use client'

import React, { useState, useEffect, HTMLAttributes } from 'react'
import { Check, Link } from 'lucide-react'

export function CopyHeading({
  children,
  ...props
}: HTMLAttributes<HTMLHeadingElement>) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (copied) {
      const t = setTimeout(() => setCopied(false), 2000)
      return () => clearTimeout(t)
    }
  }, [copied])

  const title = children?.toString()
  const id = title?.toLowerCase().replace(/\s+/g, '-')
  if (!title) return null

  return (
    <div className="group">
      <h1
        {...props}
        id={id}
        className="inline-block hover:cursor-pointer hover:underline -mb-4 scroll-mt-24 font-serif"
        onClick={() =>
          id &&
          document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
        }
      >
        {title}
        <button
          onClick={(e) => {
            e.stopPropagation()
            if (!id) return
            const url = `${window.location.pathname}#${id}`
            window.navigator.clipboard.writeText(window.location.origin + url)
            setCopied(true)
          }}
          className="xs:opacity-100 xl:opacity-0 group-hover:opacity-100 p-2 rounded-full transition-opacity duration-300 ease-in-out"
          aria-label="Copy link to section"
        >
          {copied ? (
            <Check className="text-green-500 h-5 w-5" />
          ) : (
            <Link className="h-5 w-5" />
          )}
        </button>
      </h1>
    </div>
  )
}
