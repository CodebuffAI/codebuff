'use client'

import { ChevronRight, Globe, Loader2, Search, Wrench } from 'lucide-react'
import { useState } from 'react'

import type { AgentBlock, ChatBlock, ToolBlock } from '@/app/chat/blocks'
import type { LucideIcon } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Markdown } from './markdown'

/** Renders a block tree: markdown text, tool-call rows, and nested
 *  collapsible agent boxes (mirrors the CLI's agent branches). */
export function BlockList(props: { blocks: ChatBlock[]; nested?: boolean }) {
  return (
    <div className={cn('space-y-3', props.nested && 'space-y-2.5')}>
      {props.blocks.map((block, i) => {
        if (block.type === 'text') {
          return block.text.trim() ? (
            <Markdown key={i} text={block.text} />
          ) : null
        }
        if (block.type === 'tool') {
          return <ToolRow key={block.toolCallId} tool={block} />
        }
        return <AgentBox key={block.agentId} agent={block} />
      })}
    </div>
  )
}

function lastTextSnippet(blocks: ChatBlock[]): string {
  for (let i = blocks.length - 1; i >= 0; i--) {
    const block = blocks[i]
    if (block.type === 'text' && block.text.trim()) {
      return block.text.trim().split('\n').filter(Boolean).pop() ?? ''
    }
    if (block.type === 'agent') {
      const nested = lastTextSnippet(block.blocks)
      if (nested) return nested
    }
  }
  return ''
}

function AgentBox({ agent }: { agent: AgentBlock }) {
  const running = agent.status === 'running'
  // Collapsed until the user opens it; the summary row shows the prompt so
  // it's clear what the agent is working on.
  const [open, setOpen] = useState(false)

  const preview = open
    ? undefined
    : agent.prompt || lastTextSnippet(agent.blocks)

  return (
    <div
      className={cn(
        'overflow-hidden rounded-xl border border-white/10 bg-white/[0.03]',
        running && 'border-white/15',
      )}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-white/[0.04] transition-colors"
      >
        <ChevronRight
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            open && 'rotate-90',
          )}
        />
        <span className="shrink-0 font-medium text-foreground/90">
          {agent.name}
        </span>
        {running ? (
          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />
        ) : (
          <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-px text-[10px] uppercase tracking-wider text-muted-foreground/70">
            done
          </span>
        )}
        {!open && preview && (
          <span className="min-w-0 truncate text-[13px] text-muted-foreground/70">
            {preview}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-white/[0.06] px-3.5 py-3 text-[13.5px] leading-6">
          {agent.prompt && (
            <p className="mb-2.5 border-l-2 border-white/10 pl-2.5 text-[13px] italic leading-5 text-muted-foreground/80">
              {agent.prompt}
            </p>
          )}
          <BlockList blocks={agent.blocks} nested />
          {running && agent.blocks.length === 0 && (
            <p className="animate-pulse text-[13px] text-muted-foreground/60">
              working…
            </p>
          )}
        </div>
      )}
    </div>
  )
}

const TOOL_META: Record<
  string,
  { icon: LucideIcon; running: string; done: string }
> = {
  web_search: { icon: Search, running: 'Searching', done: 'Searched' },
  read_url: { icon: Globe, running: 'Reading', done: 'Read' },
}

function ToolRow({ tool }: { tool: ToolBlock }) {
  const meta = TOOL_META[tool.toolName] ?? {
    icon: Wrench,
    running: tool.toolName,
    done: tool.toolName,
  }
  const Icon = meta.icon
  const verb = tool.status === 'running' ? meta.running : meta.done
  return (
    <div className="flex min-w-0 items-center gap-2 text-[13px] text-muted-foreground">
      {tool.status === 'running' ? (
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
      )}
      <span className="shrink-0">{verb}</span>
      {tool.label && (
        <span className="min-w-0 truncate text-muted-foreground/70">
          {tool.label}
        </span>
      )}
    </div>
  )
}
