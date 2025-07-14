import React, { useState, useEffect } from 'react'
import { useMDXComponent } from 'next-contentlayer/hooks'
import { cn } from '@/lib/utils'
import Image from 'next/image'
import { CodeDemo } from './code-demo'
import { MarkdownTable } from './markdown-table'
import { SchemaDisplay } from './schema-display'
import { Check, Link } from 'lucide-react'
import { useIsMobile } from '@/hooks/use-mobile'

import { HTMLAttributes, AnchorHTMLAttributes, ImgHTMLAttributes } from 'react'

interface MdxProps {
  code: string
}

// Helper function to create heading components with copy link functionality
const createHeadingWithCopyLink = (
  HeadingComponent: 'h1' | 'h2' | 'h3' | 'h4',
  defaultClasses: string
) => {
  const HeadingWithCopyLink = ({
    className,
    children,
    ...props
  }: HTMLAttributes<HTMLHeadingElement>) => {
    const [copied, setCopied] = useState(false)
    const [showCopyButton, setShowCopyButton] = useState(false)
    const isMobile = useIsMobile()

    useEffect(() => {
      if (copied) {
        const timer = setTimeout(() => setCopied(false), 2000)
        return () => clearTimeout(timer)
      }
      return undefined
    }, [copied])

    // Auto-hide copy button on mobile after 3 seconds
    useEffect(() => {
      if (isMobile && showCopyButton) {
        const timer = setTimeout(() => setShowCopyButton(false), 1_500)
        return () => clearTimeout(timer)
      }
      return undefined
    }, [isMobile, showCopyButton])

    const title = children?.toString()

    // Generate hierarchical ID by including heading level context
    const generateHierarchicalId = (text: string, level: string) => {
      const baseId = text
        ?.toLowerCase()
        .replace(/\s+/g, '-')
        .replace(/[^\w-]/g, '')

      // Use heading level to create meaningful hierarchy
      const levelNum = parseInt(level.replace('h', ''))

      // For h1, use as-is. For h2+, prefix with level to ensure uniqueness
      // This creates URLs like: #overview (h1), #h2-overview (h2), etc.
      return levelNum === 1 ? baseId : `${level}-${baseId}`
    }

    const id = title
      ? generateHierarchicalId(title, HeadingComponent)
      : undefined

    if (!title) {
      return (
        <HeadingComponent
          {...props}
          className={cn(
            'group relative hover:cursor-pointer hover:underline scroll-m-20',
            defaultClasses,
            className
          )}
        >
          {children}
        </HeadingComponent>
      )
    }

    const handleCopy = (e: React.MouseEvent) => {
      e.stopPropagation()
      if (!id) return
      const url = `${window.location.pathname}#${id}`
      window.navigator.clipboard.writeText(window.location.origin + url)
      setCopied(true)
    }

    const handleClick = () => {
      if (id) {
        document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' })
      }

      // On mobile, toggle copy button visibility when title is tapped
      if (isMobile) {
        setShowCopyButton(!showCopyButton)
      }
    }

    // Determine button visibility based on device type
    const buttonVisibilityClass = isMobile
      ? showCopyButton
        ? 'opacity-100'
        : 'opacity-0'
      : 'xs:opacity-100 xl:opacity-0 group-hover:opacity-100'

    return (
      <div className="group">
        <HeadingComponent
          {...props}
          id={id}
          className={cn(
            'hover:cursor-pointer hover:underline scroll-m-20 inline-flex items-center gap-2',
            defaultClasses,
            className
          )}
          onClick={handleClick}
        >
          {children}
          <button
            onClick={handleCopy}
            className={cn(
              buttonVisibilityClass,
              'p-1.5 rounded-md bg-muted/50 hover:bg-muted border border-border/50 hover:border-border transition-all duration-200 ease-in-out inline-flex items-center justify-center shadow-sm hover:shadow-md',
              isMobile ? 'min-h-[44px] min-w-[44px]' : 'h-auto w-auto'
            )}
            aria-label="Copy link to section"
          >
            {copied ? (
              <Check className="text-green-500 h-4 w-4" />
            ) : (
              <Link className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            )}
          </button>
        </HeadingComponent>
      </div>
    )
  }

  return HeadingWithCopyLink
}

const components = {
  a: ({ className, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a
      className={cn(
        'text-primary underline underline-offset-4 hover:no-underline font-medium',
        className
      )}
      {...props}
    />
  ),
  h1: createHeadingWithCopyLink(
    'h1',
    'mt-6 text-3xl font-semibold tracking-tight first:mt-0 first:mb-0'
  ),
  h2: createHeadingWithCopyLink(
    'h2',
    'mt-8 text-2xl font-semibold tracking-tight'
  ),
  h3: createHeadingWithCopyLink(
    'h3',
    'mt-6 text-xl font-semibold tracking-tight'
  ),
  h4: createHeadingWithCopyLink(
    'h4',
    'mt-4 text-lg font-semibold tracking-tight'
  ),
  p: ({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) => (
    <p
      className={cn('leading-7 mt-2 mb-3 text-muted-foreground', className)}
      {...props}
    />
  ),
  ul: ({ className, ...props }: HTMLAttributes<HTMLUListElement>) => (
    <ul className={cn('my-4 ml-6 list-disc', className)} {...props} />
  ),
  ol: ({ className, ...props }: HTMLAttributes<HTMLOListElement>) => (
    <ol className={cn('my-4 ml-6 list-decimal', className)} {...props} />
  ),
  li: ({ className, ...props }: HTMLAttributes<HTMLLIElement>) => (
    <li className={cn('mt-2', className)} {...props} />
  ),
  blockquote: ({ className, ...props }: HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className={cn(
        'mt-4 border-l-2 pl-4 italic text-muted-foreground',
        className
      )}
      {...props}
    />
  ),
  img: ({ className, alt, ...props }: ImgHTMLAttributes<HTMLImageElement>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={cn('rounded-md', className)} alt={alt} {...props} />
  ),
  hr: ({ ...props }) => <hr className="my-4 md:my-6" {...props} />,
  table: ({ className, ...props }: HTMLAttributes<HTMLTableElement>) => (
    <div className="my-6 w-full overflow-x-auto">
      <table className={cn('w-full', className)} {...props} />
    </div>
  ),
  tr: ({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) => (
    <tr
      className={cn('m-0 border-t p-0 even:bg-muted', className)}
      {...props}
    />
  ),
  th: ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
    <th
      className={cn(
        'border px-4 py-2 text-left font-bold [&[align=center]]:text-center [&[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }: HTMLAttributes<HTMLTableCellElement>) => (
    <td
      className={cn(
        'border px-4 py-2 text-left [&[align=center]]:text-center [&[align=right]]:text-right',
        className
      )}
      {...props}
    />
  ),
  pre: ({ className, ...props }: HTMLAttributes<HTMLPreElement>) => (
    <pre
      className={cn(
        'mb-4 mt-4 overflow-x-auto rounded-lg border bg-black/5 dark:bg-white/5 py-4',
        className
      )}
      {...props}
    />
  ),
  code: ({ className, ...props }: HTMLAttributes<HTMLElement>) => (
    <code
      className={cn(
        'relative rounded px-[0.3rem] py-[0.2rem] font-mono text-sm bg-muted',
        className
      )}
      {...props}
    />
  ),
  Image,
  CodeDemo,
  MarkdownTable,
  SchemaDisplay,
  AgentOverrideSchemaDisplay: SchemaDisplay,
  AgentTemplateSchemaDisplay: SchemaDisplay,
}

export function Mdx({ code }: MdxProps) {
  const Component = useMDXComponent(code)
  return <Component components={components} />
}
