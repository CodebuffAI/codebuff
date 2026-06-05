'use client'

import { api } from '@/convex/_generated/api'
import {
  ChevronDown,
  Loader,
  MessageCirclePlus,
  Undo,
  CheckCircle,
  TriangleAlert,
  Wrench,
  Sparkles as SparklesIcon,
  ExternalLink,
  Clock,
  Play,
} from 'lucide-react'
import React, {
  useImperativeHandle,
  useMemo,
  forwardRef,
  useState,
  useEffect,
  useRef,
} from 'react'
import { useStickToBottom } from 'use-stick-to-bottom'
import {
  useQuery,
  usePaginatedQuery,
  useAction,
  useMutation,
} from 'convex/react'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/vly/components/ui/collapsible'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/vly/components/ui/dialog'
import { Button } from '@/vly/components/ui/button'
import { cn } from '@/vly/lib/utils'
import { FunctionReturnType } from 'convex/server'
import { UpgradePrompt } from '@/vly/components/billing/FeatureGate'
import { useCustomer } from 'autumn-js/react'
import { getActivePlan } from '@/vly/lib/billing'
import {
  freePlan,
  oneTimeCreditPack,
  recurringCreditPack,
} from '@/vly/autumn.config'
import { PLAN_BASE_CREDITS, type TierName } from '@/vly/autumn/constants'
import { useDirectPlanCheckout } from '@/vly/hooks/useDirectPlanCheckout'
import { useCreditsBalance } from '@/vly/hooks/useCreditCheck'
import {
  formatCredits,
  getNextTier,
  getFormattedPriceWithPeriod,
} from '@/vly/autumn/helpers'
import { Coins, ArrowRight, Plus } from 'lucide-react'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/vly/components/ui/popover'
import { toast } from 'sonner'
import {
  fetchGravityAd,
  type GravityAd,
  type GravityAdMessage,
} from './GravityAdSlot'

// Helper function to format credits in thousands (10k, 100k, 1M)
const formatCreditsDisplay = (credits: number): string => {
  if (credits < 1000) {
    return `${credits} credits`
  } else if (credits < 1000000) {
    const k = credits / 1000
    return k >= 100
      ? `${Math.round(k)}k credits`
      : `${k.toFixed(1).replace(/\.0$/, '')}k credits`
  } else {
    const m = credits / 1000000
    return `${m.toFixed(1).replace(/\.0$/, '')}M credits`
  }
}

// Map plan IDs to tier names
const PLAN_ID_TO_TIER: Record<string, TierName> = {
  free_plan: 'free',
  starter_plan: 'starter',
  hobby_plan: 'hobby',
  business_plan: 'business',
  scale_plan: 'scale',
  priority_plan: 'priority',
  ultra_plan: 'ultra',
  max_plan: 'max',
  unlimited_plan: 'unlimited',
  enterprise_plan: 'unlimited',
  // Legacy mappings
  hobby_custom_plan: 'hobby',
  pro_custom_plan: 'business',
  pro_plan: 'business',
  team_plan: 'scale',
  team_custom_plan: 'scale',
}

// Credit pack options - one-time and recurring
const ONE_TIME_CREDIT_PACK = {
  product: oneTimeCreditPack,
  label: '15M Credits (One-Time)',
  amount: '15,000,000 credits',
  price: '$15',
  isRecurring: false,
}

const RECURRING_CREDIT_PACK = {
  product: recurringCreditPack,
  label: '15M Credits (Monthly)',
  amount: '15,000,000 credits/mo',
  price: '$12/mo',
  isRecurring: true,
}

const CREDIT_PACK_OPTIONS = [RECURRING_CREDIT_PACK, ONE_TIME_CREDIT_PACK]

// Scroll to Bottom Button Component
const ScrollToBottomButton: React.FC<{ onClick: () => void }> = ({
  onClick,
}) => (
  <div className="pointer-events-none absolute bottom-20 right-6 z-50 mb-4">
    <button
      onClick={onClick}
      className="pointer-events-auto flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-zinc-800 shadow-md transition-shadow hover:shadow-lg"
      aria-label="Scroll to bottom"
    >
      <ChevronDown className="h-5 w-5" />
    </button>
  </div>
)

export interface AgentChatMessagesRef {
  scrollToBottom: () => void
}

interface AgentChatMessagesProps {
  project: FunctionReturnType<typeof api.project.getProjectData>
  projectSemanticIdentifier: string
  onSendMessage: (message: string) => void | Promise<unknown>
  onCreateNewThread?: () => void
  messagesStatus?:
    | 'LoadingFirstPage'
    | 'CanLoadMore'
    | 'LoadingMore'
    | 'Exhausted'
    | undefined
  loadMoreThreadMessages?: (n: number) => void
  onRestoreMessage?: (message: string) => void
}

// Thinking Indicator with Accelerated Count-up Timer
const ThinkingIndicator: React.FC = () => {
  const [elapsedMs, setElapsedMs] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const animationFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const updateTimer = () => {
      if (startTimeRef.current === null) return
      const now = Date.now()
      const elapsed = now - startTimeRef.current
      setElapsedMs(elapsed)
      animationFrameRef.current = requestAnimationFrame(updateTimer)
    }

    startTimeRef.current = Date.now()
    animationFrameRef.current = requestAnimationFrame(updateTimer)

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current)
      }
    }
  }, [])

  // Format milliseconds with variable pacing
  // Counts quickly for 1 second, then counts very slowly for 1 second
  // Total displayed time always equals actual elapsed time
  const formatTime = (ms: number): string => {
    const twoSecondCycle = ms % 2000 // 2-second cycles
    const cycleNumber = Math.floor(ms / 2000)

    let displayMs: number

    if (twoSecondCycle < 1000) {
      // First second: count quickly (1990ms in 1000ms real time = 1.99x speed)
      // This balances with the slow second to total exactly 2000ms over 2 seconds
      const fastProgress = twoSecondCycle / 1000 // 0 to 1 over 1000ms
      const fastIncrement = 1990 * fastProgress // Count 1990ms in 1000ms real time
      displayMs = cycleNumber * 2000 + fastIncrement
    } else {
      // Second second: count extremely slowly (10ms in 1000ms real time = 0.01x speed)
      // Total: 1990ms + 10ms = 2000ms over 2000ms real time (exact match)
      const slowProgress = (twoSecondCycle - 1000) / 1000 // 0 to 1 over 1000ms
      const slowIncrement = 10 * slowProgress // Only add 10ms over the 1000ms slowdown
      displayMs = cycleNumber * 2000 + 1990 + slowIncrement
    }

    // Always display in milliseconds format
    return `${Math.floor(displayMs)}ms`
  }

  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader className="h-3 w-3 animate-spin text-primary" />
      <span className="animate-pulse font-normal">Thinking</span>
      <span className="font-mono tabular-nums">{formatTime(elapsedMs)}</span>
    </span>
  )
}

// Message State Badge Component - Compact and subtle
const MessageStateBadge: React.FC<{ state: string; stateMessage?: string }> = ({
  state,
  stateMessage,
}) => {
  const stateColors = {
    Processing: 'text-primary',
    Completed: 'text-emerald-400',
    Paused: 'text-amber-300',
    Cancelled: 'text-muted-foreground',
    Error: 'text-red-400',
  }

  // Show "Thinking" instead of "Processing"
  const displayText =
    state === 'Processing'
      ? 'Thinking'
      : state === 'Paused'
        ? 'Waiting for you'
        : state

  return (
    <span
      className={cn(
        'text-xs font-normal',
        stateColors[state as keyof typeof stateColors] ||
          'text-muted-foreground',
      )}
    >
      {displayText}
      {stateMessage && (
        <span className="ml-1 opacity-70">({stateMessage})</span>
      )}
    </span>
  )
}

// Type for assistant stream item
type AssistantStreamItemType = {
  type: string
  title?: string
  status?: string
  content: string
  description?: string
}

const TIME_LIMIT_CONTINUE_MESSAGE = 'continue'

type AskUserOption = {
  label: string
  description?: string
}

type AskUserQuestion = {
  question: string
  header?: string
  options: AskUserOption[]
  multiSelect?: boolean
}

type AskUserAnswer = {
  selected: string[]
  custom: string
}

function parseAskUserQuestions(content: string): AskUserQuestion[] {
  try {
    const parsed = JSON.parse(content)
    const questions = Array.isArray(parsed) ? parsed : parsed?.questions
    if (!Array.isArray(questions)) return []

    return questions
      .map((question: any): AskUserQuestion | null => {
        const text = String(question?.question ?? '').trim()
        const options = Array.isArray(question?.options)
          ? question.options
              .map((option: any): AskUserOption | null => {
                const label = String(option?.label ?? '').trim()
                if (!label) return null
                const description = String(option?.description ?? '').trim()
                return { label, ...(description ? { description } : {}) }
              })
              .filter((option: AskUserOption | null): option is AskUserOption =>
                Boolean(option),
              )
          : []

        if (!text || options.length === 0) return null
        const header = String(question?.header ?? '').trim()
        return {
          question: text,
          ...(header ? { header } : {}),
          options,
          multiSelect: question?.multiSelect === true,
        }
      })
      .filter((question: AskUserQuestion | null): question is AskUserQuestion =>
        Boolean(question),
      )
  } catch {
    return []
  }
}

function formatAskUserResumeMessage(
  questions: AskUserQuestion[],
  answers: Record<number, AskUserAnswer>,
) {
  const lines = [
    'Here are my answers to your paused questions. Continue from the saved Freebuff run state.',
    '',
  ]

  questions.forEach((question, index) => {
    const answer = answers[index]
    const selected = answer?.selected ?? []
    const custom = answer?.custom.trim()
    const parts = [
      selected.length ? selected.join(', ') : '',
      custom ? custom : '',
    ].filter(Boolean)

    lines.push(`${index + 1}. ${question.question}`)
    lines.push(`Answer: ${parts.join(' | ') || 'No answer provided'}`)
    lines.push('')
  })

  return lines.join('\n').trim()
}

function isPromptTimeLimitText(text?: string | null) {
  if (!text) return false
  const normalized = text.toLowerCase()
  return (
    normalized.includes('timed out after 10 minutes') ||
    normalized.includes('10 minute limit') ||
    normalized.includes('10-minute limit') ||
    normalized.includes('maximum time limit')
  )
}

function isPromptTimeLimitItem(item: AssistantStreamItemType) {
  return (
    item.type === 'timeout_continue' ||
    isPromptTimeLimitText(item.title) ||
    isPromptTimeLimitText(item.content)
  )
}

type AgentMessageForAd =
  | FunctionReturnType<
      typeof api.coding_agent.cli_agent.queries.getAgentThreadMessages
    >[0]
  | FunctionReturnType<
      typeof api.coding_agent.cli_agent.queries.getStreamedAgentMessages
    >[0]

function getAssistantTextForAd(message: AgentMessageForAd): string {
  return (message.assistant_stream ?? [])
    .filter(
      (item: AssistantStreamItemType) =>
        item.type === 'text' || item.type === 'assistant',
    )
    .map((item: AssistantStreamItemType) => item.content)
    .join('')
    .trim()
    .slice(0, 800)
}

function buildGravityMessagesForAgentAd(
  message: AgentMessageForAd,
): GravityAdMessage[] {
  const messages: GravityAdMessage[] = []
  if (message.user_message?.trim()) {
    messages.push({
      role: 'user',
      content: message.user_message.trim(),
    })
  }

  const assistantText = getAssistantTextForAd(message)
  if (assistantText) {
    messages.push({
      role: 'assistant',
      content: assistantText,
    })
  }

  return messages
}

function fireAdImpressionOnce(ad: GravityAd) {
  if (typeof window === 'undefined' || !ad.impUrl) return
  void fetch('/api/ads/impression', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ impUrl: ad.impUrl }),
    keepalive: true,
  }).catch((error) => {
    console.warn('[AgentChatMessages] Failed to record ad impression', error)
  })
}

function recordAdClick(ad: { impUrl: string }) {
  if (typeof window === 'undefined' || !ad.impUrl) return
  void fetch('/api/ads/click', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ impUrl: ad.impUrl }),
    keepalive: true,
  }).catch((error) => {
    console.warn('[AgentChatMessages] Failed to record ad click', error)
  })
}

// Lightweight markdown renderer - optimized for performance
const SimpleMarkdown: React.FC<{ text: string }> = React.memo(({ text }) => {
  const elements = React.useMemo(() => {
    const lines = text.split('\n')
    const result: React.ReactNode[] = []
    let inCodeBlock = false
    let codeBlockLines: string[] = []
    let listItems: string[] = []
    let inList = false

    const renderInline = (line: string): React.ReactNode => {
      // Simple inline parsing: bold and inline code
      const parts: React.ReactNode[] = []
      let lastIndex = 0
      let key = 0

      // Use regex to find all matches (bold and code)
      const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g
      let match

      while ((match = regex.exec(line)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index))
        }

        const matched = match[0]
        if (matched.startsWith('**')) {
          // Bold
          parts.push(<strong key={key++}>{matched.slice(2, -2)}</strong>)
        } else if (matched.startsWith('`')) {
          // Inline code
          parts.push(
            <code
              key={key++}
              className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-foreground/85"
            >
              {matched.slice(1, -1)}
            </code>,
          )
        }

        lastIndex = regex.lastIndex
      }

      // Add remaining text
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex))
      }

      return parts.length > 0 ? <>{parts}</> : line
    }

    lines.forEach((line, index) => {
      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          result.push(
            <pre
              key={`code-${index}`}
              className="my-2 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground/85"
            >
              <code>{codeBlockLines.join('\n')}</code>
            </pre>,
          )
          codeBlockLines = []
          inCodeBlock = false
        } else {
          inCodeBlock = true
        }
        return
      }

      if (inCodeBlock) {
        codeBlockLines.push(line)
        return
      }

      // Headers
      const headerMatch = line.match(/^(#{1,3})\s+(.+)$/)
      if (headerMatch) {
        const level = headerMatch[1].length
        const content = headerMatch[2]
        const Tag = `h${Math.min(level + 2, 6)}` as 'h3' | 'h4' | 'h5' | 'h6'
        const sizes = {
          1: 'text-base font-semibold mt-3 mb-1',
          2: 'text-sm font-semibold mt-2.5 mb-1',
          3: 'text-sm font-medium mt-2 mb-0.5',
        }
        result.push(
          <Tag
            key={index}
            className={`${sizes[level as keyof typeof sizes] || sizes[3]} text-foreground`}
          >
            {renderInline(content)}
          </Tag>,
        )
        return
      }

      // Lists
      const listMatch = line.match(/^[\s]*[-*+]\s+(.+)$/)
      if (listMatch) {
        if (!inList) {
          inList = true
        }
        listItems.push(listMatch[1])
        return
      }

      // End of list (empty line or non-list content)
      if (inList) {
        result.push(
          <ul
            key={`list-${index}`}
            className="mb-2 ml-5 mt-1 list-disc space-y-1"
          >
            {listItems.map((item, i) => (
              <li
                key={i}
                className="text-sm leading-relaxed text-foreground/85"
              >
                {renderInline(item)}
              </li>
            ))}
          </ul>,
        )
        listItems = []
        inList = false
        // Continue processing the current line if it's not empty
        if (line.trim() === '') {
          return
        }
      }

      // Empty lines
      if (line.trim() === '') {
        result.push(<div key={index} className="h-1" />)
        return
      }

      // Regular paragraph
      result.push(
        <p
          key={index}
          className="mb-1.5 text-sm leading-relaxed text-foreground/85"
        >
          {renderInline(line)}
        </p>,
      )
    })

    // Flush any remaining list
    if (inList && listItems.length > 0) {
      result.push(
        <ul key="list-final" className="mb-2 ml-5 mt-1 list-disc space-y-1">
          {listItems.map((item, i) => (
            <li key={i} className="text-sm leading-relaxed text-foreground/85">
              {renderInline(item)}
            </li>
          ))}
        </ul>,
      )
    }

    // Flush any remaining code block
    if (inCodeBlock && codeBlockLines.length > 0) {
      result.push(
        <pre
          key="code-final"
          className="my-2 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs leading-relaxed text-foreground/85"
        >
          <code>{codeBlockLines.join('\n')}</code>
        </pre>,
      )
    }

    return result
  }, [text])

  return <div>{elements}</div>
})

SimpleMarkdown.displayName = 'SimpleMarkdown'

// Assistant Stream Item Component - No background, just text
const AssistantStreamItem: React.FC<{
  item: AssistantStreamItemType
}> = ({ item }) => {
  const [isExpanded, setIsExpanded] = useState(false)

  // For result/error/other/system/user types, show collapsed by default with expand option
  // For assistant/text types, always show content (these are the main responses)
  const isCollapsible =
    item.type === 'result' ||
    item.type === 'error' ||
    item.type === 'other' ||
    item.type === 'system' ||
    item.type === 'user' ||
    item.type === 'tool_use' ||
    item.type === 'tool_result' ||
    item.type === 'thinking'
  const isTextType = item.type === 'text' || item.type === 'assistant'
  const isThinkingType = item.type === 'thinking'

  // Handle thinking blocks - always collapsed by default
  if (isThinkingType) {
    return (
      <div className="mb-2">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground/80">
            <span className="font-normal">Thinking…</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 border-l-2 border-border/60 pl-3">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {item.content}
              </p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  // Always show text/assistant types, only collapse other types
  if (isTextType) {
    return (
      <div className="mb-2">
        {item.title && (
          <div className="mb-1.5 text-xs font-medium text-muted-foreground">
            {item.title}
          </div>
        )}
        <SimpleMarkdown text={item.content} />
      </div>
    )
  }

  // For collapsible types (result, error, other, system, user, tool_use)
  if (isCollapsible) {
    // Determine display title
    let displayTitle = item.title || 'Thinking...'
    if (item.type === 'result') {
      displayTitle = 'Result'
      if (item.status) {
        displayTitle += ` (${item.status})`
      }
    } else if (item.type === 'tool_use') {
      displayTitle = item.title || 'Tool Use'
    } else if (item.type === 'tool_result') {
      displayTitle = 'Tool Result'
    } else if (item.type === 'user') {
      displayTitle = 'User Message'
    } else if (item.type === 'system') {
      displayTitle = 'System'
    }

    return (
      <div className="mb-2">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground/80">
            <span>{displayTitle}</span>
            <ChevronDown
              className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-1 border-l-2 border-border/60 pl-3">
              <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/75">
                {item.content}
              </pre>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>
    )
  }

  // For other types, show content directly with title
  return (
    <div className="mb-2">
      {item.title && (
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {item.title}
        </div>
      )}
      <pre className="whitespace-pre-wrap font-mono text-xs text-foreground/75">
        {item.content}
      </pre>
    </div>
  )
}

// ─── Cursor-style turn rendering ─────────────────────────────────────────────
// Stream items split into two visual lanes:
//   • text/assistant items render inline in full.
//   • everything else (tool_use, tool_result, thinking, system, result, error)
//     groups into one collapsed Activity block per consecutive run.
// Inside an expanded Activity, items still use AssistantStreamItem so each
// individual entry stays expandable too.

const TEXT_TYPES = new Set(['text', 'assistant'])

type StreamGroup =
  | { kind: 'text'; items: AssistantStreamItemType[] }
  | { kind: 'ask_user'; items: AssistantStreamItemType[] }
  | { kind: 'activity'; items: AssistantStreamItemType[] }

const groupStreamItems = (stream: AssistantStreamItemType[]): StreamGroup[] => {
  const groups: StreamGroup[] = []
  for (const item of stream) {
    const kind: StreamGroup['kind'] =
      item.type === 'ask_user'
        ? 'ask_user'
        : TEXT_TYPES.has(item.type)
          ? 'text'
          : 'activity'
    const last = groups[groups.length - 1]
    if (last && last.kind === kind) {
      last.items.push(item)
    } else {
      groups.push({ kind, items: [item] })
    }
  }
  return groups
}

const TextGroup: React.FC<{
  items: AssistantStreamItemType[]
}> = React.memo(({ items }) => {
  const fullText = useMemo(
    () => items.map((item) => item.content ?? '').join(''),
    [items],
  )

  const firstTitle = items.find((item) => item.title)?.title

  return (
    <div className="mb-2">
      {firstTitle && (
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {firstTitle}
        </div>
      )}
      <SimpleMarkdown text={fullText} />
    </div>
  )
})
TextGroup.displayName = 'TextGroup'

const humanizeActivityLabel = (value: string) => {
  const trimmed = value.trim()
  if (!trimmed) return ''

  const normalized = trimmed
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()

  return normalized.charAt(0).toUpperCase() + normalized.slice(1)
}

const getActivityItemLabel = (item: AssistantStreamItemType) => {
  if (item.type === 'thinking') return 'Reasoning'
  if (item.type === 'timeout_continue') return 'Continue required'
  if (item.type === 'error') return 'Error'
  if (item.type === 'result') {
    return item.status ? `Result ${item.status}` : 'Result'
  }
  if (item.type === 'tool_result') return 'Tool result'
  if (item.type === 'system') return 'System'
  if (item.type === 'user') return 'User message'

  if (item.type === 'tool_use') {
    const title = item.title?.trim()
    if (title && title !== 'Tool Use' && title !== 'Command Execution') {
      return humanizeActivityLabel(title)
    }

    const descriptionHead = item.description?.split(':')[0]?.trim()
    if (descriptionHead && descriptionHead !== 'Command Execution') {
      return humanizeActivityLabel(descriptionHead)
    }

    return title === 'Command Execution' ? 'Command' : 'Tool'
  }

  return humanizeActivityLabel(item.title || item.type || 'Step')
}

// Build a one-line summary describing a run of activity items so the user
// knows what's hidden inside the collapsed group without expanding.
const buildActivitySummary = (items: AssistantStreamItemType[]) => {
  return items.map(getActivityItemLabel).filter(Boolean).join(', ')
}

// One collapsible group rendering a consecutive run of non-text stream items.
// Collapsed by default; shows a wrench/sparkles icon, a one-line summary, and
// a chevron. When expanded, falls back to <AssistantStreamItem> per child so
// individual entries remain independently expandable.
const ActivityGroup: React.FC<{
  items: AssistantStreamItemType[]
}> = ({ items }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const summary = useMemo(() => buildActivitySummary(items), [items])
  const hasError = items.some((item) => item.type === 'error')
  const usesTools = items.some(
    (item) => item.type === 'tool_use' || item.type === 'tool_result',
  )
  const Icon = hasError ? TriangleAlert : usesTools ? Wrench : SparklesIcon

  return (
    <div className="mb-2">
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <CollapsibleTrigger
          className={cn(
            'flex w-full cursor-pointer items-center gap-1.5 text-xs font-medium transition-colors',
            hasError
              ? 'text-red-400 hover:text-red-300'
              : 'text-muted-foreground hover:text-foreground/80',
          )}
        >
          <Icon className="h-3 w-3" />
          <span className="min-w-0 truncate" title={summary}>
            {summary}
          </span>
          <ChevronDown
            className={cn(
              'h-3 w-3 shrink-0 transition-transform',
              isExpanded ? 'rotate-180' : '',
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="mt-1 border-l-2 border-border/60 pl-3">
            {items.map((item, index) => (
              <AssistantStreamItem key={index} item={item} />
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}

const TimeLimitContinuePanel: React.FC<{
  onContinue?: () => void | Promise<unknown>
}> = ({ onContinue }) => {
  const [isContinuing, setIsContinuing] = useState(false)

  const handleContinue = async () => {
    if (!onContinue || isContinuing) return
    setIsContinuing(true)
    try {
      await onContinue()
    } finally {
      setIsContinuing(false)
    }
  }

  return (
    <div className="mb-4 mt-3 rounded-lg border border-border bg-muted/35 px-4 py-3">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background text-muted-foreground">
            <Clock className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-foreground">
              Maximum time limit for a prompt reached
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Engagement required to continue. Your chat history and current
              project state are saved, so Freebuff can pick up from here.
            </p>
          </div>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={handleContinue}
          disabled={!onContinue || isContinuing}
          className="h-8 shrink-0"
        >
          {isContinuing ? (
            <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-1.5 h-3.5 w-3.5" />
          )}
          Continue
        </Button>
      </div>
    </div>
  )
}

const AskUserPanel: React.FC<{
  item: AssistantStreamItemType
  isActive: boolean
  onSubmit?: (message: string) => void | Promise<unknown>
}> = ({ item, isActive, onSubmit }) => {
  const questions = useMemo(
    () => parseAskUserQuestions(item.content),
    [item.content],
  )
  const [answers, setAnswers] = useState<Record<number, AskUserAnswer>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (questions.length === 0) return null

  const updateAnswer = (index: number, next: Partial<AskUserAnswer>) => {
    setAnswers((current) => ({
      ...current,
      [index]: {
        selected: current[index]?.selected ?? [],
        custom: current[index]?.custom ?? '',
        ...next,
      },
    }))
  }

  const toggleOption = (
    question: AskUserQuestion,
    questionIndex: number,
    label: string,
  ) => {
    const current = answers[questionIndex]?.selected ?? []
    if (question.multiSelect) {
      updateAnswer(questionIndex, {
        selected: current.includes(label)
          ? current.filter((value) => value !== label)
          : [...current, label],
      })
    } else {
      updateAnswer(questionIndex, { selected: [label] })
    }
  }

  const hasEveryAnswer = questions.every((_, index) => {
    const answer = answers[index]
    return !!answer && (answer.selected.length > 0 || answer.custom.trim())
  })

  const handleSubmit = async () => {
    if (!onSubmit || !isActive || !hasEveryAnswer || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSubmit(formatAskUserResumeMessage(questions, answers))
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleSkip = async () => {
    if (!onSubmit || !isActive || isSubmitting) return
    setIsSubmitting(true)
    try {
      await onSubmit(
        'I am skipping the paused questions. Make reasonable default choices and continue from the saved Freebuff run state.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="mb-4 mt-2 rounded-lg border border-border bg-muted/25 px-4 py-3">
      <div className="mb-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Freebuff needs your input
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Answer these questions to continue from the saved run state.
        </p>
      </div>

      <div className="space-y-4">
        {questions.map((question, questionIndex) => {
          const answer = answers[questionIndex] ?? {
            selected: [],
            custom: '',
          }

          return (
            <div key={questionIndex} className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {question.header && (
                  <span className="rounded bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {question.header}
                  </span>
                )}
                <div className="text-sm font-medium text-foreground">
                  {question.question}
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2">
                {question.options.map((option) => {
                  const selected = answer.selected.includes(option.label)
                  return (
                    <button
                      key={option.label}
                      type="button"
                      disabled={!isActive || isSubmitting}
                      onClick={() =>
                        toggleOption(question, questionIndex, option.label)
                      }
                      className={cn(
                        'rounded-md border px-3 py-2 text-left text-sm transition-colors',
                        selected
                          ? 'border-primary bg-primary/15 text-foreground'
                          : 'border-border bg-background/40 text-muted-foreground hover:border-muted-foreground/50 hover:text-foreground',
                        (!isActive || isSubmitting) &&
                          'cursor-not-allowed opacity-60',
                      )}
                    >
                      <div className="font-medium">{option.label}</div>
                      {option.description && (
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {option.description}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              <input
                value={answer.custom}
                disabled={!isActive || isSubmitting}
                onChange={(event) =>
                  updateAnswer(questionIndex, { custom: event.target.value })
                }
                placeholder="Or type a custom answer..."
                className="h-9 w-full rounded-md border border-border bg-background/50 px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        {!isActive && (
          <span className="mr-auto self-center text-xs text-muted-foreground">
            This question was answered or superseded by a later message.
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={!isActive || isSubmitting}
          onClick={handleSkip}
        >
          Skip
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!isActive || !hasEveryAnswer || isSubmitting}
          onClick={handleSubmit}
        >
          {isSubmitting && <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
          Continue
        </Button>
      </div>
    </div>
  )
}

// Compact Paywall Component for in-chat display - matches CreditOverlay format
const CompactPaywallBump: React.FC = () => {
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [isPopoverOpen, setIsPopoverOpen] = useState(false)
  const [isPurchasing, setIsPurchasing] = useState<string | null>(null)
  const { customer, refetch } = useCustomer()
  const { directPlanCheckout } = useDirectPlanCheckout()
  const { planName, isLoading } = useCreditsBalance()

  // Get current tier from plan ID
  const getCurrentTier = (): TierName => {
    if (!customer?.products) return 'free'
    const { planId } = getActivePlan(customer.products, customer, freePlan.id)
    return PLAN_ID_TO_TIER[planId] || 'free'
  }

  const currentTier = getCurrentTier()
  const nextTierDef = getNextTier(currentTier)
  const isOnFreePlan = currentTier === 'free'
  const nextTierName = nextTierDef ? nextTierDef.name : null
  const nextTierPrice = nextTierDef ? nextTierDef.basePrice : 0
  const nextTierCredits = nextTierDef ? nextTierDef.creditsIncluded : 0

  // Determine target tier for dialog - support all tiers including hidden ones
  const validTiers: (
    | 'Starter'
    | 'Hobby'
    | 'Business'
    | 'Scale'
    | 'Priority'
    | 'Ultra'
    | 'Max'
    | 'Unlimited'
  )[] = [
    'Starter',
    'Hobby',
    'Business',
    'Scale',
    'Priority',
    'Ultra',
    'Max',
    'Unlimited',
  ]
  const targetTier:
    | 'Starter'
    | 'Hobby'
    | 'Business'
    | 'Scale'
    | 'Priority'
    | 'Ultra'
    | 'Max'
    | 'Unlimited' = isOnFreePlan
    ? 'Starter'
    : nextTierName && validTiers.includes(nextTierName as any)
      ? (nextTierName as
          | 'Starter'
          | 'Hobby'
          | 'Business'
          | 'Scale'
          | 'Priority'
          | 'Ultra'
          | 'Max'
          | 'Unlimited')
      : 'Hobby'

  const handleViewPlans = (e?: React.MouseEvent) => {
    e?.preventDefault()
    e?.stopPropagation()
    setIsDialogOpen(true)
  }

  const handleBuyOneTimePack = async (productId: string) => {
    setIsPurchasing(productId)
    setIsPopoverOpen(false)

    try {
      await directPlanCheckout({
        productId,
        productName: 'One-Time Credit Pack',
        isSubscriptionUpgrade: false,
      })
      toast.success('Credits purchased successfully!')
      await refetch()
    } catch (error: any) {
      const redirectUrl =
        error?.url || error?.data?.url || (error as any)?.checkout_url
      if (redirectUrl) {
        window.location.href = redirectUrl
        return
      }
      const errorMessage =
        error?.message ||
        error?.data?.message ||
        'Failed to purchase credits. Please try again.'
      toast.error(errorMessage)
    } finally {
      setIsPurchasing(null)
    }
  }

  if (isLoading) {
    return null
  }

  return (
    <>
      <div className="mt-3 w-full max-w-full overflow-hidden rounded-xl border border-amber-200 bg-gradient-to-r from-amber-50 to-orange-50 p-3 shadow-sm">
        <div className="flex items-start gap-2.5">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-amber-100">
            <Coins className="h-4 w-4 text-amber-600" />
          </div>
          <div className="min-w-0 flex-1 overflow-hidden">
            <h4 className="break-words text-sm font-semibold text-amber-900">
              Out of Agent Credits
            </h4>
            <p className="mt-0.5 break-words text-xs leading-relaxed text-amber-800">
              {isOnFreePlan
                ? "You've used all your Free credits. Choose an option below to continue building."
                : `You've used all your ${planName} credits. Choose an option below to continue building.`}
            </p>
            <div className="mt-3 space-y-2">
              <div className="flex flex-col gap-2">
                {/* View tier option - opens dialog first */}
                {nextTierDef && nextTierName && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleViewPlans}
                    className="h-8 w-full bg-amber-600 text-xs font-medium text-white hover:bg-amber-700"
                  >
                    <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                    <span className="truncate">
                      View {nextTierName} (${nextTierPrice}/mo)
                    </span>
                  </Button>
                )}

                {/* One-time credit pack option */}
                <Popover open={isPopoverOpen} onOpenChange={setIsPopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={isPurchasing !== null}
                      className="h-8 w-full border-amber-300 bg-white text-xs font-medium text-amber-700 hover:bg-amber-50"
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      <span className="truncate">Buy One-Time Pack</span>
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-80 p-3" align="start">
                    <div className="space-y-3">
                      <div>
                        <h4 className="text-sm font-semibold text-zinc-900">
                          One-Time Credit Packs
                        </h4>
                        <p className="mt-1 text-xs text-zinc-600">
                          Get more credits without changing your plan
                        </p>
                        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/50 p-2">
                          <p className="text-[10px] font-medium text-amber-800">
                            💡 <strong>Better value:</strong> Upgrading your
                            tier gives you more credits per dollar with
                            recurring monthly credits.
                          </p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        {CREDIT_PACK_OPTIONS.map((pack) => (
                          <button
                            key={pack.product.id}
                            onClick={() =>
                              handleBuyOneTimePack(pack.product.id)
                            }
                            disabled={isPurchasing !== null}
                            className="group flex w-full items-center justify-between rounded-lg border border-amber-200/60 bg-gradient-to-r from-amber-50/60 to-white/60 p-3 text-left transition-all hover:border-amber-300/80 hover:from-amber-100/80 hover:to-amber-50/80 hover:shadow-sm active:scale-[0.98] disabled:opacity-50"
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <div className="text-sm font-semibold text-zinc-900">
                                  {pack.label}
                                </div>
                                {pack.isRecurring && (
                                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700">
                                    Best Value
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-zinc-600">
                                {pack.amount}
                              </div>
                            </div>
                            <div className="ml-3 flex items-center gap-2">
                              {isPurchasing === pack.product.id && (
                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" />
                              )}
                              <div className="text-sm font-bold text-amber-700">
                                {pack.price}
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <div className="break-words text-[11px] leading-relaxed text-amber-600">
                💡 Your work is saved -{' '}
                {nextTierDef
                  ? `upgrade to ${nextTierName} for ${formatCredits(nextTierCredits)} credits/month (better value) or `
                  : ''}
                buy a one-time pack
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upgrade to {targetTier} Plan</DialogTitle>
          </DialogHeader>
          {/* UpgradePrompt with hidden title and no border - buttons are built-in below price */}
          <div className="mt-2">
            <UpgradePrompt
              requiredPlan={targetTier}
              message={
                isOnFreePlan
                  ? `You've used all your free credits (4M one-time). Upgrade to ${targetTier} plan (${getFormattedPriceWithPeriod('starter')}) to get ${formatCredits(PLAN_BASE_CREDITS.starter)} credits every month and continue building with AI assistance.`
                  : `Upgrade to ${targetTier} plan to get more credits and continue building with AI assistance.`
              }
              showUpgradeButton={true}
              hideTitle={true}
              borderless={true}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

type PersistedAgentAd = NonNullable<AgentMessageForAd['ad_payload']>

const AgentAdMessage: React.FC<{
  ad: PersistedAgentAd
  className?: string
}> = ({ ad, className }) => {
  const imageUrl = ad.imageUrl || ad.favicon
  const title = ad.title || ad.brandName || 'Sponsored recommendation'
  const cta = ad.cta || 'Learn more'
  const rootRef = useRef<HTMLDivElement | null>(null)
  const impressionFiredRef = useRef(false)

  useEffect(() => {
    const root = rootRef.current
    if (!root || impressionFiredRef.current) return

    const fire = () => {
      if (impressionFiredRef.current) return
      impressionFiredRef.current = true
      fireAdImpressionOnce(ad)
    }

    if (typeof IntersectionObserver === 'undefined') {
      fire()
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          fire()
          observer.disconnect()
        }
      },
      { threshold: 0.5 },
    )

    observer.observe(root)
    return () => observer.disconnect()
  }, [ad])

  return (
    <div
      ref={rootRef}
      className={cn('mb-3 w-full max-w-[min(100%,680px)] text-sm', className)}
    >
      <a
        href={ad.clickUrl}
        target="_blank"
        rel="noopener noreferrer sponsored"
        onClick={() => recordAdClick(ad)}
        className="group flex items-start gap-2.5 text-left no-underline"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md text-xs font-semibold text-muted-foreground">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt=""
              className="h-10 w-10 object-contain"
              loading="lazy"
            />
          ) : (
            title.charAt(0).toUpperCase()
          )}
        </span>
        <span className="min-w-0 flex-1 pt-0.5">
          <span className="mb-0.5 flex min-w-0 items-center gap-1.5 text-[11px] leading-none text-muted-foreground">
            <span className="uppercase tracking-wide text-muted-foreground/70">
              Sponsored
            </span>
            <span className="text-muted-foreground/45">·</span>
            <span className="truncate font-semibold text-foreground/90">
              {title}
            </span>
          </span>
          {ad.adText && (
            <span className="block line-clamp-2 text-[13px] leading-snug text-muted-foreground">
              {ad.adText}
            </span>
          )}
          <span className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium leading-none text-muted-foreground/80 underline-offset-4 group-hover:text-primary group-hover:underline">
            {cta}
            <ExternalLink className="h-3 w-3 shrink-0" />
          </span>
        </span>
      </a>
    </div>
  )
}

// Agent Message Component - No card, just text with user message having google-doc outline
const AgentMessageCard: React.FC<{
  message:
    | FunctionReturnType<
        typeof api.coding_agent.cli_agent.queries.getAgentThreadMessages
      >[0]
    | FunctionReturnType<
        typeof api.coding_agent.cli_agent.queries.getStreamedAgentMessages
      >[0]
  adAfterUser?: PersistedAgentAd
  isLatestMessage?: boolean
  onRollback?: () => Promise<void>
  onContinueAfterTimeout?: () => void | Promise<unknown>
  onAskUserAnswer?: (message: string) => void | Promise<unknown>
}> = ({
  message,
  adAfterUser,
  isLatestMessage = false,
  onRollback,
  onContinueAfterTimeout,
  onAskUserAnswer,
}) => {
  const [isRevertDialogOpen, setIsRevertDialogOpen] = useState(false)
  const [isRestoring, setIsRestoring] = useState(false)
  if (message.ad_payload) {
    return <AgentAdMessage ad={message.ad_payload} />
  }

  const isStreaming = message.isStreaming
  const assistantStream = (message.assistant_stream ??
    []) as AssistantStreamItemType[]
  const isPromptTimeLimit =
    isPromptTimeLimitText(message.state_message) ||
    assistantStream.some(isPromptTimeLimitItem)
  const visibleAssistantStream = assistantStream.filter(
    (item) => !isPromptTimeLimitItem(item),
  )
  const hasStream = visibleAssistantStream.length > 0
  const isAskUserPaused = String(message.state) === 'Paused'

  const hasCheckpoint =
    message.commit_hash &&
    message.commit_hash !== 'creating' &&
    message.commit_hash !== 'failed'

  const shouldShowUndo = !!onRollback

  // Check if this is an insufficient credits/paywall message
  const isPaywallMessage =
    message.state === 'Error' &&
    message.state_message &&
    message.state_message.toLowerCase().includes('insufficient credits')

  return (
    <div className="mb-6 w-full max-w-full overflow-hidden">
      {/* User Message — softer, theme-aware bubble */}
      {message.user_message && (
        <div className="mb-4 flex items-center gap-2">
          <div className="flex min-w-0 flex-1 items-start gap-3 rounded-xl bg-muted/60 px-4 py-2.5">
            <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
              {message.user_message}
            </p>
            {/* Restore stays inside the user message; no hover width animation. */}
            {shouldShowUndo && (
              <Dialog
                open={isRevertDialogOpen}
                onOpenChange={setIsRevertDialogOpen}
              >
                <DialogTrigger asChild>
                  <button
                    className="ml-auto mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-background/70 hover:text-foreground"
                    title="Restore to here"
                    aria-label="Restore to here"
                  >
                    <Undo className="h-3.5 w-3.5" />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Restore to checkpoint</DialogTitle>
                    <div className="space-y-3 pt-2">
                      <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                        <div className="flex items-start gap-2">
                          <TriangleAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber-600" />
                          <div className="space-y-1 text-sm text-amber-900">
                            <div className="font-medium">
                              This will revert your project
                            </div>
                            <div className="text-xs">
                              {hasCheckpoint
                                ? 'All code changes, file edits, and modifications made after this checkpoint will be undone.'
                                : 'This message and all messages after it will be removed from the chat.'}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-start gap-2">
                          <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                          <div>Your chat history will be preserved</div>
                        </div>
                        {hasCheckpoint && (
                          <div className="flex items-start gap-2">
                            <CheckCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-green-600" />
                            <div>
                              You can re-apply reverted changes from the
                              Versions page
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </DialogHeader>
                  <DialogFooter>
                    <DialogClose asChild>
                      <Button variant="outline">Cancel</Button>
                    </DialogClose>
                    <Button
                      variant="destructive"
                      disabled={isRestoring}
                      onClick={async () => {
                        setIsRestoring(true)
                        try {
                          if (onRollback) {
                            await onRollback()
                          }
                          setIsRevertDialogOpen(false)
                        } catch (error) {
                          console.error('Failed to restore:', error)
                        } finally {
                          setIsRestoring(false)
                        }
                      }}
                    >
                      {isRestoring ? (
                        <>
                          <Loader className="mr-2 h-4 w-4 animate-spin" />
                          Restoring...
                        </>
                      ) : (
                        'Restore'
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>
      )}

      {adAfterUser && (
        <AgentAdMessage ad={adAfterUser} className="-mt-1 mb-4" />
      )}

      {/* Assistant Stream Content - text rendered inline; tool calls /
          thinking / system items group into a
          single collapsed Activity row per consecutive run, Cursor-style. */}
      {hasStream ? (
        <div className="space-y-1.5">
          {groupStreamItems(visibleAssistantStream).map((group, index) =>
            group.kind === 'text' ? (
              <TextGroup key={index} items={group.items} />
            ) : group.kind === 'ask_user' ? (
              <AskUserPanel
                key={index}
                item={group.items[group.items.length - 1]}
                isActive={isAskUserPaused && isLatestMessage}
                onSubmit={onAskUserAnswer}
              />
            ) : (
              <ActivityGroup key={index} items={group.items} />
            ),
          )}
        </div>
      ) : isStreaming ? (
        // Show thinking indicator when waiting for first response (no stream yet)
        <div className="mb-2">
          <ThinkingIndicator />
        </div>
      ) : null}

      {isPromptTimeLimit && (
        <TimeLimitContinuePanel onContinue={onContinueAfterTimeout} />
      )}

      {/* Status and metadata at the bottom — compact and subtle */}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {isStreaming && hasStream && <ThinkingIndicator />}
        {!isStreaming && !isPromptTimeLimit && (
          <MessageStateBadge
            state={String(message.state)}
            stateMessage={message.state_message}
          />
        )}
        {!isStreaming && isPromptTimeLimit && (
          <span className="text-muted-foreground">Waiting for you</span>
        )}
        {message.credits_deducted !== undefined &&
          message.credits_deducted > 0 && (
            <span className="font-mono text-muted-foreground">
              {formatCreditsDisplay(message.credits_deducted)}
            </span>
          )}
        {message.model_used && (
          <span className="font-mono text-muted-foreground">
            {message.model_used}
          </span>
        )}
      </div>

      {/* Show compact paywall bump when insufficient credits */}
      {isPaywallMessage && <CompactPaywallBump />}
    </div>
  )
}

export const AgentChatMessages = forwardRef<
  AgentChatMessagesRef,
  AgentChatMessagesProps
>(function AgentChatMessages(
  { project, projectSemanticIdentifier, onSendMessage, onRestoreMessage },
  ref,
) {
  // All hooks must be called unconditionally before any early returns
  const { scrollRef, contentRef, scrollToBottom, isAtBottom } =
    useStickToBottom({
      initial: 'smooth',
      resize: 'smooth',
    })

  // Track if user has manually scrolled up
  const [hasScrolledUp, setHasScrolledUp] = useState(false)
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Determine if we should query - only if there's an active thread
  const hasActiveThread = !!project?.active_agent_thread

  // Load thread messages with pagination - only if active thread exists
  const {
    results: threadMessages,
    loadMore: loadMoreAgentMessages,
    status: agentMessagesStatus,
  } = usePaginatedQuery(
    api.coding_agent.cli_agent.queries.listAgentThreadMessages,
    hasActiveThread
      ? { semanticIdentifier: projectSemanticIdentifier }
      : 'skip',
    { initialNumItems: 20 },
  )

  // Get streamed messages - only query if project has active thread
  const streamedMessages = useQuery(
    api.coding_agent.cli_agent.queries.getStreamedAgentMessages,
    hasActiveThread
      ? { semanticIdentifier: projectSemanticIdentifier }
      : 'skip',
  )

  // Determine loading state - only show loading if there IS an active thread AND queries haven't returned yet
  // When skipped (no active thread), queries return undefined immediately - don't show loading
  const isLoading =
    hasActiveThread &&
    (threadMessages === undefined || streamedMessages === undefined)

  // Handle empty states - if no active thread, queries return undefined, treat as empty array
  // Filter deactivated messages client-side - move array creation inside useMemo
  const filteredThreadMessages = useMemo(() => {
    const threadMessagesArray = threadMessages ?? []
    return threadMessagesArray.filter((msg: any) => msg.deactivated !== true)
  }, [threadMessages])

  const filteredStreamedMessages = useMemo(() => {
    const streamedMessagesArray = streamedMessages ?? []
    return streamedMessagesArray.filter((msg: any) => msg.deactivated !== true)
  }, [streamedMessages])

  // Combine and sort messages (oldest first for rendering)
  const sortedMessages = useMemo(() => {
    const allMessages = [...filteredThreadMessages, ...filteredStreamedMessages]
    // Sort by _creationTime (oldest first for bottom-up rendering)
    return allMessages.sort((a, b) => a._creationTime - b._creationTime)
  }, [filteredThreadMessages, filteredStreamedMessages])

  const persistAgentAdMessage = useMutation(
    api.coding_agent.cli_agent.agent_message.persistAgentAdMessage,
  )
  const attemptedAdSourceIdsRef = useRef<Set<string>>(new Set())

  const adBySourceMessageId = useMemo(() => {
    const ads = new Map<string, PersistedAgentAd>()
    sortedMessages.forEach((message) => {
      if (message.ad_source_message_id && message.ad_payload) {
        ads.set(message.ad_source_message_id, message.ad_payload)
      }
    })
    return ads
  }, [sortedMessages])

  const messagesForRendering = useMemo(() => {
    const visibleMessageIds = new Set(
      sortedMessages.map((message) => message._id),
    )

    return sortedMessages.filter((message) => {
      if (!message.ad_payload || !message.ad_source_message_id) return true
      return !visibleMessageIds.has(message.ad_source_message_id)
    })
  }, [sortedMessages])

  const latestRenderableMessageId = useMemo(() => {
    for (let i = messagesForRendering.length - 1; i >= 0; i--) {
      const message = messagesForRendering[i]
      if (!message.ad_payload) return message._id
    }
    return undefined
  }, [messagesForRendering])

  const sourceMessageForAd = useMemo(() => {
    const sourceIdsWithAds = new Set(
      sortedMessages
        .map((message) => message.ad_source_message_id)
        .filter(Boolean),
    )

    for (let i = sortedMessages.length - 1; i >= 0; i--) {
      const message = sortedMessages[i]
      if (message.ad_payload) continue
      if (!message.user_message) continue
      if (sourceIdsWithAds.has(message._id)) continue
      return message
    }

    return null
  }, [sortedMessages])

  useEffect(() => {
    if (!project?.active_agent_thread || !sourceMessageForAd) return

    const sourceMessageId = sourceMessageForAd._id
    if (attemptedAdSourceIdsRef.current.has(sourceMessageId)) return

    const gravityMessages = buildGravityMessagesForAgentAd(sourceMessageForAd)
    if (gravityMessages.length === 0) return

    attemptedAdSourceIdsRef.current.add(sourceMessageId)
    let cancelled = false

    void fetchGravityAd(
      gravityMessages,
      `${project.active_agent_thread}-${sourceMessageId}`,
      false,
    )
      .then(async (ad) => {
        if (cancelled || !ad) return

        await persistAgentAdMessage({
          sourceMessageId,
          ad: {
            provider: ad.provider ?? 'gravity',
            adText: ad.adText,
            title: ad.title,
            cta: ad.cta,
            ...(ad.brandName ? { brandName: ad.brandName } : {}),
            url: ad.url,
            ...(ad.favicon
              ? { favicon: ad.favicon, imageUrl: ad.favicon }
              : {}),
            clickUrl: ad.clickUrl,
            impUrl: ad.impUrl,
            placementId: 'agent-chat-below-response',
            servedAt: Date.now(),
          },
        })
      })
      .catch((error) => {
        attemptedAdSourceIdsRef.current.delete(sourceMessageId)
        console.warn('[AgentChatMessages] Failed to persist Gravity ad', error)
      })

    return () => {
      cancelled = true
    }
  }, [persistAgentAdMessage, project?.active_agent_thread, sourceMessageForAd])
  // Rollback functionality
  const revertToCommit = useAction(api.codesandbox.versionControl.revert)
  const deactivateAgentMessageMutation = useAction(
    api.coding_agent.cli_agent.agent_message.deactivateAgentMessageAndAfter,
  )
  const updateThreadSessionId = useAction(
    api.coding_agent.cli_agent.agent_thread
      .updateAgentThreadActiveSessionIdPublic,
  )

  // Get latest external change timestamp for rollback filtering
  const latestExternalChangeTimestamp = useQuery(
    api.thread.getLatestExternalChangeTimestamp,
    { semanticIdentifier: projectSemanticIdentifier },
  )

  // Get active thread to check agent type
  const activeThread = useQuery(
    api.coding_agent.cli_agent.agent_thread.getAgentThreadPublic,
    hasActiveThread && project?.active_agent_thread
      ? { threadId: project.active_agent_thread }
      : 'skip',
  )

  // Memoize rollback callbacks for all user messages
  const rollbackCallbacks = useMemo(() => {
    const callbacks = new Map<string, () => Promise<void>>()

    // Check if this is Codex or Gemini CLI agent type
    const isCodexOrGemini =
      activeThread?.agent_type === 'Codex' ||
      activeThread?.agent_type === 'Gemini CLI'

    // Create restore callbacks for all user messages
    sortedMessages.forEach((message) => {
      if (message.user_message) {
        // Hide undo button for messages that existed before the latest external change
        if (
          latestExternalChangeTimestamp &&
          message._creationTime < latestExternalChangeTimestamp
        ) {
          return // Don't add callback for this message
        }

        callbacks.set(message._id, async () => {
          // Find the last message before this one that has a session_id
          // This will be the message we want to resume from
          const messageIndex = sortedMessages.findIndex(
            (m) => m._id === message._id,
          )
          let previousMessageWithSessionId: string | undefined = undefined

          if (messageIndex > 0) {
            // Look backwards through messages to find the last one with a session_id
            for (let i = messageIndex - 1; i >= 0; i--) {
              if (sortedMessages[i].session_id) {
                previousMessageWithSessionId = sortedMessages[i].session_id
                break
              }
            }
          }

          // Restore message text to input
          if (onRestoreMessage && message.user_message) {
            let restoreText = message.user_message

            // For Codex and Gemini CLI, add previous message context
            if (isCodexOrGemini && messageIndex > 0) {
              // Find the previous user message before the one being reverted to
              let previousUserMessage: string | undefined = undefined
              for (let i = messageIndex - 1; i >= 0; i--) {
                if (sortedMessages[i].user_message) {
                  previousUserMessage = sortedMessages[i].user_message
                  break
                }
              }

              // Format restore text with previous message context
              if (previousUserMessage) {
                restoreText = `Version has been reverted to the previous user message: "${previousUserMessage}"\n\nNew Prompt:\n${message.user_message}`
              }
            }

            onRestoreMessage(restoreText)
          }

          // Always deactivate messages from this point onwards (including the target message)
          await deactivateAgentMessageMutation({
            messageId: message._id,
          })

          // Update thread's active_session_id to the message BEFORE the deactivated one
          // This ensures git sync works correctly by resuming from the right point
          if (project?.active_agent_thread) {
            await updateThreadSessionId({
              threadId: project.active_agent_thread,
              activeSessionId: previousMessageWithSessionId,
            })
          }

          // If message has a valid checkpoint, also revert to it
          if (
            message.commit_hash &&
            message.commit_hash !== 'creating' &&
            message.commit_hash !== 'failed'
          ) {
            await revertToCommit({
              semanticIdentifier: projectSemanticIdentifier,
              commitHash: message.commit_hash,
              source: 'chat',
            })
          }
        })
      }
    })

    return callbacks
  }, [
    sortedMessages,
    revertToCommit,
    projectSemanticIdentifier,
    deactivateAgentMessageMutation,
    latestExternalChangeTimestamp,
    onRestoreMessage,
    updateThreadSessionId,
    project,
    activeThread?.agent_type,
  ])

  // Track scroll position to detect manual scroll up
  useEffect(() => {
    const el = scrollRef.current as unknown as HTMLElement | null
    if (!el) return

    const handleScroll = () => {
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }

      // Check if user scrolled up (not at bottom)
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50
      setHasScrolledUp(!atBottom)

      // Auto-enable scroll lock after a delay if user scrolls back to bottom
      if (atBottom) {
        scrollTimeoutRef.current = setTimeout(() => {
          setHasScrolledUp(false)
        }, 1000)
      }
    }

    el.addEventListener('scroll', handleScroll)
    return () => {
      el.removeEventListener('scroll', handleScroll)
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current)
      }
    }
  }, [scrollRef])

  // Load more messages when reaching top
  useEffect(() => {
    const el = scrollRef.current as unknown as HTMLElement | null
    if (!el || !loadMoreAgentMessages) return

    const onScroll = () => {
      if (el.scrollTop <= 8 && agentMessagesStatus === 'CanLoadMore') {
        loadMoreAgentMessages(20)
      }
    }

    el.addEventListener('scroll', onScroll)
    return () => el.removeEventListener('scroll', onScroll)
  }, [scrollRef, loadMoreAgentMessages, agentMessagesStatus])

  // Expose scrollToBottom function to parent via ref
  useImperativeHandle(
    ref,
    () => ({
      scrollToBottom,
    }),
    [scrollToBottom],
  )

  // Show empty state if no active thread OR no messages
  const shouldShowEmptyState =
    !hasActiveThread || (sortedMessages.length === 0 && !isLoading)

  // Early return if project is not loaded - AFTER all hooks
  if (!project) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center text-zinc-500">Loading project...</div>
      </div>
    )
  }

  return (
    <>
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        <div ref={contentRef} className="px-4 py-3">
          {isLoading ? (
            <div className="flex justify-center py-4">
              <Loader className="h-6 w-6 animate-spin text-zinc-400" />
            </div>
          ) : (
            <>
              {/* Render all messages */}
              {shouldShowEmptyState ? (
                <div className="flex min-h-[400px] flex-col items-center justify-center py-12 text-center">
                  <div className="mb-4 rounded-full bg-slate-100 p-4">
                    <MessageCirclePlus className="h-8 w-8 text-slate-400" />
                  </div>
                  <div className="mb-2 text-sm font-semibold text-slate-700">
                    {!hasActiveThread
                      ? 'No active thread'
                      : 'Start a new conversation'}
                  </div>
                  <div className="mb-4 text-xs text-slate-500">
                    {!hasActiveThread
                      ? 'Create a new thread to begin chatting with Codex agent'
                      : 'Start typing what you want'}
                  </div>
                </div>
              ) : (
                <>
                  {messagesForRendering.map((message) => (
                    <AgentMessageCard
                      key={message._id}
                      message={message}
                      adAfterUser={adBySourceMessageId.get(message._id)}
                      isLatestMessage={message._id === latestRenderableMessageId}
                      onRollback={rollbackCallbacks.get(message._id)}
                      onContinueAfterTimeout={() =>
                        onSendMessage(TIME_LIMIT_CONTINUE_MESSAGE)
                      }
                      onAskUserAnswer={onSendMessage}
                    />
                  ))}
                </>
              )}

              {/* Processing Indicator - removed, status shown in message */}
            </>
          )}
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {hasScrolledUp && !isAtBottom && (
        <ScrollToBottomButton onClick={scrollToBottom} />
      )}
    </>
  )
})

AgentChatMessages.displayName = 'AgentChatMessages'
