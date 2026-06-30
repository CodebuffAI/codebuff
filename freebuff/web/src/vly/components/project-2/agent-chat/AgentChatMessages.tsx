'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { trackRedditGravityAdClick } from '@/lib/reddit-funnel'
import {
  ChevronDown,
  Loader,
  MessageCirclePlus,
  Undo,
  CheckCircle,
  TriangleAlert,
  Wrench,
  ExternalLink,
  Clock,
  Play,
} from 'lucide-react'
import { GravityAd as GravityReactAd } from '@gravity-ai/react'
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
import { toast } from 'sonner'
import {
  fetchGravityAds,
  buildGravityContext,
  type GravityAd,
  type GravityContext,
  type GravityAdMessage,
} from './GravityAdSlot'
import { ThinkingState } from '../ThinkingState'
import { ReviewingState } from '../ReviewingState'
import { useSession } from 'next-auth/react'

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
  onActiveAskUserQuestionsChange?: (questions: AskUserQuestion[]) => void
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

export type AskUserOption = {
  label: string
  description?: string
}

export type AskUserQuestion = {
  question: string
  header?: string
  options: AskUserOption[]
  multiSelect?: boolean
}

export type AskUserAnswer = {
  selected: string[]
  custom: string
}

export function parseAskUserQuestions(content: string): AskUserQuestion[] {
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
          multiSelect:
            question?.multiSelect === true ||
            question?.multi_select === true ||
            question?.allowMultiple === true ||
            question?.allow_multiple === true,
        }
      })
      .filter((question: AskUserQuestion | null): question is AskUserQuestion =>
        Boolean(question),
      )
  } catch {
    return []
  }
}

export function formatAskUserResumeMessage(
  questions: AskUserQuestion[],
  answers: Record<number, AskUserAnswer>,
) {
  const lines: string[] = []

  questions.forEach((question, index) => {
    const answer = answers[index]
    const selected = answer?.selected ?? []
    const custom = answer?.custom.trim()
    const parts = [
      selected.length ? selected.join(', ') : '',
      custom ? custom : '',
    ].filter(Boolean)

    lines.push(
      `${question.header || `Answer ${index + 1}`}: ${
        parts.join(' | ') || 'No answer provided'
      }`,
    )
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

type AgentAdPlacement = 'agent-chat-after-user' | 'agent-chat-after-assistant'

const GRAVITY_CHAT_PLACEMENT_TO_AGENT_PLACEMENT: Record<
  string,
  AgentAdPlacement
> = {
  'Web-Chat-After-User-Message': 'agent-chat-after-user',
  'Web-Chat-After-Assistant-Message': 'agent-chat-after-assistant',
}

const UUID_LIKE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isClientOnlyAgentMessage(message: Pick<AgentMessageForAd, '_id'>) {
  return (
    (message as { _optimistic?: boolean })._optimistic === true ||
    UUID_LIKE_ID_PATTERN.test(String(message._id))
  )
}

function warnAdClient(message: string, error?: unknown) {
  if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod') return
  if (error === undefined) {
    console.warn(message)
  } else {
    console.warn(message, error)
  }
}

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

function getAdCreativeIdentity(ad: {
  adText: string
  title: string
  url: string
}): string {
  return `${ad.url}\n${ad.title}\n${ad.adText}`
}

function isTrackedSetupLink(href: string) {
  return /^https:\/\/index\.trygravity\.ai\/go\//.test(href)
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
      // Simple inline parsing: links, bold, and inline code.
      const parts: React.ReactNode[] = []
      let lastIndex = 0
      let key = 0

      const regex =
        /(\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|\*\*[^*]+\*\*|`[^`]+`)/g
      let match

      while ((match = regex.exec(line)) !== null) {
        // Add text before match
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index))
        }

        const matched = match[0]
        if (match[2] && match[3]) {
          const label = match[2]
          const href = match[3]
          const trackedSetupLink = isTrackedSetupLink(href)
          parts.push(
            <a
              key={key++}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={cn(
                trackedSetupLink
                  ? 'my-1 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground no-underline shadow-sm transition-colors hover:bg-[hsl(0_0%_88%)] hover:text-primary-foreground'
                  : 'text-primary underline underline-offset-4 hover:text-primary/80',
              )}
            >
              {label}
              {trackedSetupLink && <ExternalLink className="h-3.5 w-3.5" />}
            </a>,
          )
        } else if (matched.startsWith('**')) {
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
  const isThinkingType = item.type === 'thinking' || item.type === 'reasoning'

  // Handle reasoning blocks - always collapsed by default
  if (isThinkingType) {
    return (
      <div className="mb-2">
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-start gap-2 py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground/80">
            <span className="font-normal">Reasoning</span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="ml-1 mt-2 border-l-2 border-border/60 pl-3">
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
          <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-start gap-2 py-1 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground/80">
            <span>{displayTitle}</span>
            <ChevronDown
              className={`h-3 w-3 shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="mt-2 border-l-2 border-border/60 pl-3">
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
    <div className="mb-1">
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

const isSuggestFollowupsItem = (item: AssistantStreamItemType) => {
  return [item.title, item.description?.split(':')[0]]
    .filter((value): value is string => !!value)
    .some(
      (value) =>
        value.trim().toLowerCase().replace(/[_-]+/g, ' ') ===
        'suggest followups',
    )
}

type SuggestedFollowup = { prompt: string; label?: string }

// Suggest-followups stream items written by the Freebuff bridge carry a JSON
// payload of `{ followups: [{ prompt, label? }] }`. Older items only contain
// placeholder text ("Running tool") — parsing those fails and renders nothing.
const parseSuggestedFollowups = (content: string): SuggestedFollowup[] => {
  try {
    const parsed = JSON.parse(content)
    const list = Array.isArray(parsed?.followups) ? parsed.followups : []
    return list
      .filter(
        (f: unknown): f is { prompt: string; label?: unknown } =>
          typeof (f as { prompt?: unknown })?.prompt === 'string' &&
          !!(f as { prompt: string }).prompt.trim(),
      )
      .map((f: { prompt: string; label?: unknown }) => ({
        prompt: f.prompt,
        label:
          typeof f.label === 'string' && f.label.trim() ? f.label : undefined,
      }))
      .slice(0, 4)
  } catch {
    return []
  }
}

const isAskUserStatusItem = (item: AssistantStreamItemType) =>
  item.type === 'status' &&
  (item.title?.trim().toLowerCase() === 'ask user' ||
    item.content.trim().toLowerCase() === 'waiting for your answer')

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
  isStreaming?: boolean
}> = React.memo(({ items, isStreaming = false }) => {
  const fullText = useMemo(
    () => items.map((item) => item.content ?? '').join(''),
    [items],
  )

  const firstTitle = items.find((item) => item.title)?.title

  return (
    <div>
      {firstTitle && (
        <div className="mb-1.5 text-xs font-medium text-muted-foreground">
          {firstTitle}
        </div>
      )}
      {isStreaming ? (
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground/85">
          {fullText}
        </p>
      ) : (
        <SimpleMarkdown text={fullText} />
      )}
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
  if (item.type === 'thinking' || item.type === 'reasoning') return 'Reasoning'
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

// Build a one-line summary of activity types without exposing reasoning text.
const buildActivitySummary = (items: AssistantStreamItemType[]) => {
  return items.map(getActivityItemLabel).filter(Boolean).join(', ')
}

// Subagent stream items carry the agent id as their title (e.g.
// "code-reviewer-minimax-m3"); all reviewer variants contain "review".
const REVIEWER_TITLE_RE = /review/i

// Whether a code-reviewer subagent is the activity currently streaming. We walk
// from the end of the stream: if the most recent meaningful activity is a
// reviewer subagent (and not assistant text that came after it), the run is in
// its review phase. Tool/status/reasoning items run in parallel with review, so
// they're skipped rather than treated as "review finished".
const isReviewingNow = (
  stream: AssistantStreamItemType[],
  isStreaming: boolean,
) => {
  if (!isStreaming) return false
  for (let i = stream.length - 1; i >= 0; i--) {
    const item = stream[i]
    if (item.type === 'subagent') {
      return REVIEWER_TITLE_RE.test(item.title ?? '')
    }
    if (item.type === 'text' && (item.content ?? '').trim().length > 0) {
      return false
    }
  }
  return false
}

const PLACEHOLDER_ACTIVITY_CONTENT = new Set([
  '',
  'running tool',
  'waiting for your answer',
])

const hasMeaningfulActivityContent = (item: AssistantStreamItemType) => {
  const content = (item.content ?? '').trim()
  return !PLACEHOLDER_ACTIVITY_CONTENT.has(content.toLowerCase())
}

const isDetailedActivityItem = (item: AssistantStreamItemType) => {
  if (!hasMeaningfulActivityContent(item)) return false

  if (item.type === 'reasoning' || item.type === 'thinking') {
    return false
  }

  if (
    item.type === 'subagent' ||
    item.type === 'error' ||
    item.type === 'timeout_continue'
  ) {
    return true
  }

  if (item.type === 'tool_result') return true

  if (
    item.type === 'result' ||
    item.type === 'system' ||
    item.type === 'other'
  ) {
    return item.content.trim().length > 40 || item.content.includes('\n')
  }

  // Tool-call status rows usually only say "Running tool"; keep the dropdown
  // reserved for comprehensive output such as subagent notes and terminal/tool
  // results.
  return false
}

// One collapsible group rendering a consecutive run of non-text stream items.
// Collapsed by default; shows a compact status icon, a one-line summary, and a
// chevron. When expanded, falls back to <AssistantStreamItem> per child so
// individual entries remain independently expandable.
const ActivityGroup: React.FC<{
  items: AssistantStreamItemType[]
  isStreaming?: boolean
}> = ({ items, isStreaming = false }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const summary = useMemo(() => buildActivitySummary(items), [items])
  const detailedItems = useMemo(
    () => items.filter(isDetailedActivityItem),
    [items],
  )
  const hasDetails = detailedItems.length > 0
  const hasError = items.some((item) => item.type === 'error')
  const usesTools = items.some(
    (item) => item.type === 'tool_use' || item.type === 'tool_result',
  )
  // Only surface an icon for meaningful states (errors / tool runs). The
  // generic clock icon was noisy, so it's intentionally omitted.
  const Icon = hasError ? TriangleAlert : usesTools ? Wrench : null

  return (
    <div>
      <Collapsible
        open={hasDetails && isExpanded}
        onOpenChange={(open) => hasDetails && setIsExpanded(open)}
      >
        <CollapsibleTrigger
          disabled={!hasDetails}
          className={cn(
            'flex w-full cursor-pointer items-center justify-start gap-2 py-1 text-left text-xs font-medium transition-colors',
            isStreaming ? 'opacity-80' : 'opacity-45',
            hasError
              ? 'text-red-400 hover:text-red-300'
              : 'text-muted-foreground hover:text-foreground/80',
            !hasDetails && 'cursor-default hover:text-muted-foreground',
          )}
        >
          {Icon && <Icon className="h-3 w-3 shrink-0" />}
          <span className="min-w-0 truncate" title={summary}>
            {summary}
          </span>
          {hasDetails && (
            <ChevronDown
              className={cn(
                'h-3 w-3 shrink-0 transition-transform',
                isExpanded ? 'rotate-180' : '',
              )}
            />
          )}
        </CollapsibleTrigger>
        {hasDetails && (
          <CollapsibleContent>
            <div className="ml-1 mt-2 space-y-2 border-l-2 border-border/60 pl-3 opacity-45">
              {detailedItems.map((item, index) => (
                <AssistantStreamItem key={index} item={item} />
              ))}
            </div>
          </CollapsibleContent>
        )}
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
              Paused after 10 minutes
            </div>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Click Continue to keep going.
            </p>
          </div>
        </div>
        <Button
          type="button"
          onClick={handleContinue}
          disabled={!onContinue || isContinuing}
          className="h-11 shrink-0 px-5 text-base font-semibold"
        >
          {isContinuing ? (
            <Loader className="mr-1.5 h-3.5 w-3.5 animate-spin" />
          ) : (
            <Play className="mr-2 h-4 w-4" />
          )}
          Continue
        </Button>
      </div>
    </div>
  )
}

type PersistedAgentAd = NonNullable<AgentMessageForAd['ad_payload']>
type AdsByPlacement = Partial<Record<AgentAdPlacement, PersistedAgentAd>>
type LiveAgentAds = {
  sourceMessageId: string
  sourceCreationTime: number
  userMessage: string
  ads: AdsByPlacement
}

function toPersistedAgentAd(
  ad: GravityAd,
  placementId: AgentAdPlacement,
): PersistedAgentAd {
  return {
    provider: ad.provider ?? 'gravity',
    adText: ad.adText,
    title: ad.title,
    cta: ad.cta,
    ...(ad.brandName ? { brandName: ad.brandName } : {}),
    url: ad.url,
    ...(ad.favicon ? { favicon: ad.favicon, imageUrl: ad.favicon } : {}),
    clickUrl: ad.clickUrl,
    impUrl: ad.impUrl,
    placementId,
    servedAt: Date.now(),
  }
}

const AgentAdMessage: React.FC<{
  ad: PersistedAgentAd
  className?: string
}> = ({ ad, className }) => {
  return (
    <div
      className={cn('my-3 w-full max-w-[min(100%,760px)] text-sm', className)}
    >
      <GravityReactAd
        ad={{
          adText: ad.adText,
          title: ad.title || ad.brandName || 'Sponsored recommendation',
          cta: ad.cta || 'Open offer',
          brandName: ad.brandName,
          url: ad.url,
          favicon: ad.favicon ?? ad.imageUrl,
          impUrl: ad.impUrl,
          clickUrl: ad.clickUrl,
        }}
        variant="inline"
        className="w-full"
        onClick={() => trackRedditGravityAdClick('web')}
        slotProps={{
          container: {
            style: {
              width: '100%',
              background: 'hsl(var(--muted) / 0.25)',
              color: 'hsl(var(--foreground))',
              borderColor: 'hsl(var(--border) / 0.6)',
              borderRadius: 12,
              boxShadow: 'none',
            },
          },
          brand: { style: { color: 'hsl(var(--foreground))' } },
          title: { style: { color: 'hsl(var(--foreground))' } },
          text: { style: { color: 'hsl(var(--muted-foreground))' } },
          cta: {
            style: {
              background: 'hsl(var(--primary) / 0.15)',
              color: 'hsl(var(--primary))',
              border: 'none',
              fontWeight: 600,
            },
          },
          // Subtle, borderless marker (the default inline label has a border).
          label: {
            style: {
              color: 'hsl(var(--muted-foreground) / 0.5)',
              border: 'none',
              padding: 0,
              background: 'transparent',
            },
          },
        }}
        labelText="Ad"
        openInNewTab
      />
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
  ads?: AdsByPlacement
  onRollback?: () => Promise<void>
  onContinueAfterTimeout?: () => void | Promise<unknown>
  /** Resends this message's prompt. Only provided for the latest failed run. */
  onRetry?: () => void
}> = ({ message, ads, onRollback, onContinueAfterTimeout, onRetry }) => {
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
    (item) =>
      item.type !== 'ask_user' &&
      !isAskUserStatusItem(item) &&
      !isPromptTimeLimitItem(item) &&
      !isSuggestFollowupsItem(item) &&
      // Drop empty/whitespace-only text deltas. Otherwise they form their own
      // text group between two tool-call runs, which both splits one logical
      // activity section into two and stacks extra margins (the big gap).
      // Removing them lets consecutive activity runs merge into one group.
      !(TEXT_TYPES.has(item.type) && !(item.content ?? '').trim()),
  )
  const hasStream = visibleAssistantStream.length > 0
  const hasCheckpoint =
    message.commit_hash &&
    message.commit_hash !== 'creating' &&
    message.commit_hash !== 'failed'
  const groupedVisibleAssistantStream = useMemo(
    () => groupStreamItems(visibleAssistantStream),
    [visibleAssistantStream],
  )
  const persistentAds = useMemo(() => {
    if (!message.user_message) return ads

    return {
      'agent-chat-after-user': ads?.['agent-chat-after-user'],
      'agent-chat-after-assistant': ads?.['agent-chat-after-assistant'],
    } satisfies AdsByPlacement
  }, [ads, message.user_message])
  const renderedAssistantStreamGroups = useMemo(() => {
    let lastActivityIndex = -1
    groupedVisibleAssistantStream.forEach((group, index) => {
      if (group.kind !== 'text') lastActivityIndex = index
    })

    return groupedVisibleAssistantStream.filter((group, index) => {
      if (group.kind !== 'text') return true
      if (lastActivityIndex === -1) return true
      // Hide internal progress prose emitted between activity rows. Once the
      // run finishes, only text after the last activity group is user-facing.
      return !isStreaming && index > lastActivityIndex
    })
  }, [groupedVisibleAssistantStream, isStreaming])

  const shouldShowUndo = !!onRollback

  return (
    <div
      className={cn(
        'w-full max-w-full overflow-hidden',
        // Only messages that begin a new turn (they include a user prompt) get
        // generous separation from the content above. Assistant-only
        // continuation messages sit close to the previous one so consecutive
        // tool-call sections don't show a large gap between them.
        message.user_message ? 'mt-6 first:mt-0' : 'mt-2',
      )}
    >
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

      {persistentAds?.['agent-chat-after-user'] && (
        <AgentAdMessage
          ad={persistentAds['agent-chat-after-user']}
          className="my-3"
        />
      )}

      {/* Assistant Stream Content - text rendered inline; tool calls /
          thinking / system items group into a
          single collapsed Activity row per consecutive run, Cursor-style. */}
      {hasStream ? (
        <div className="space-y-2">
          {renderedAssistantStreamGroups.map((group, index) =>
            group.kind === 'text' ? (
              <TextGroup
                key={index}
                items={group.items}
                isStreaming={isStreaming}
              />
            ) : (
              <ActivityGroup
                key={index}
                items={group.items}
                isStreaming={isStreaming}
              />
            ),
          )}
        </div>
      ) : null}

      {/* Animated working indicator. While a code-reviewer subagent is
          streaming, swap in a distinct "Reviewing changes" indicator so the
          review phase is visually separate from general work. Hidden once
          streaming ends or the time-limit panel shows. */}
      {isStreaming &&
        !isPromptTimeLimit &&
        (isReviewingNow(assistantStream, isStreaming) ? (
          <ReviewingState activityKey={message._id} />
        ) : (
          <ThinkingState activityKey={message._id} />
        ))}

      {isPromptTimeLimit && (
        <TimeLimitContinuePanel onContinue={onContinueAfterTimeout} />
      )}

      {/* Inline error card for failed runs */}
      {message.state === 'Error' && (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground">
                This run failed
              </div>
              {message.state_message && (
                <div className="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground">
                  {message.state_message}
                </div>
              )}
              {onRetry && (
                <button
                  type="button"
                  onClick={onRetry}
                  className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                  <Undo className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {persistentAds?.['agent-chat-after-assistant'] && (
        <AgentAdMessage
          ad={persistentAds['agent-chat-after-assistant']}
          className="my-5"
        />
      )}
    </div>
  )
}

export const AgentChatMessages = forwardRef<
  AgentChatMessagesRef,
  AgentChatMessagesProps
>(function AgentChatMessages(
  {
    project,
    projectSemanticIdentifier,
    onSendMessage,
    onRestoreMessage,
    onActiveAskUserQuestionsChange,
  },
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

  // Live streaming tail. Instead of re-reading the whole growing message on
  // every update, we subscribe to only the delta rows newer than the highest
  // seq we've already applied (tracked per streaming message). The accumulated
  // deltas are reconstructed into an assistant_stream-shaped array for rendering.
  const [streamTail, setStreamTail] = useState<{
    messageId: string | null
    deltas: Array<{
      seq: number
      type: string
      title?: string
      status?: string
      content: string
      description?: string
    }>
    cursorSeq: number
  }>({ messageId: null, deltas: [], cursorSeq: -1 })

  const streamData = useQuery(
    api.coding_agent.cli_agent.queries.getStreamingMessageDeltas,
    hasActiveThread
      ? {
          semanticIdentifier: projectSemanticIdentifier,
          afterSeq: streamTail.cursorSeq,
          ...(streamTail.messageId
            ? { afterMessageId: streamTail.messageId as Id<'agent_message'> }
            : {}),
        }
      : 'skip',
  )

  useEffect(() => {
    if (streamData === undefined) return
    const message = streamData.message
    if (!message || (message as any)._optimistic) {
      // No active stream, or only a client-only optimistic placeholder (whose id
      // isn't a real Convex id and must not be used as a delta cursor): keep the
      // tail reset so the query subscribes with afterSeq:-1 and no afterMessageId.
      setStreamTail((prev) =>
        prev.messageId === null
          ? prev
          : { messageId: null, deltas: [], cursorSeq: -1 },
      )
      return
    }
    const incoming = (streamData.deltas ?? []) as Array<{
      seq: number
      type: string
      title?: string
      status?: string
      content: string
      description?: string
    }>
    setStreamTail((prev) => {
      const sameMessage = prev.messageId === message._id
      const bySeq = new Map<number, (typeof incoming)[number]>()
      if (sameMessage) for (const d of prev.deltas) bySeq.set(d.seq, d)
      for (const d of incoming) bySeq.set(d.seq, d)
      const deltas = Array.from(bySeq.values()).sort((a, b) => a.seq - b.seq)
      const maxSeq = deltas.length ? deltas[deltas.length - 1].seq : -1
      const cursorSeq = sameMessage ? Math.max(prev.cursorSeq, maxSeq) : maxSeq
      return { messageId: message._id, deltas, cursorSeq }
    })
  }, [streamData])

  const streamingMessage = useMemo(() => {
    const message = streamData?.message
    if (!message) return undefined
    const useDeltas =
      streamTail.messageId === message._id && streamTail.deltas.length > 0
    if (!useDeltas) {
      return { ...message, assistant_stream: message.assistant_stream ?? [] }
    }
    // Merge consecutive same-type streamed chunks so multi-flush text (e.g. a
    // code block split across flushes) renders as one coherent markdown block.
    const merged: AssistantStreamItemType[] = []
    for (const d of streamTail.deltas) {
      const item: AssistantStreamItemType = {
        type: d.type,
        title: d.title,
        status: d.status,
        content: d.content,
        description: d.description,
      }
      const previous = merged[merged.length - 1]
      const canMerge =
        previous &&
        previous.type === item.type &&
        previous.title === item.title &&
        previous.status === item.status &&
        previous.description === item.description &&
        (item.type === 'text' ||
          item.type === 'reasoning' ||
          item.type === 'subagent' ||
          item.type === 'assistant' ||
          item.type === 'thinking')
      if (canMerge) {
        previous.content += item.content
      } else {
        merged.push(item)
      }
    }
    return { ...message, assistant_stream: merged }
  }, [streamData, streamTail])

  // Determine loading state - only show loading if there IS an active thread AND queries haven't returned yet
  // When skipped (no active thread), queries return undefined immediately - don't show loading
  const isLoading =
    hasActiveThread &&
    (threadMessages === undefined || streamData === undefined)

  // Handle empty states - if no active thread, queries return undefined, treat as empty array
  // Filter deactivated messages client-side - move array creation inside useMemo
  const filteredThreadMessages = useMemo(() => {
    const threadMessagesArray = threadMessages ?? []
    return threadMessagesArray.filter((msg: any) => msg.deactivated !== true)
  }, [threadMessages])

  // Lazy-load the immutable coalesced bodies for completed list messages. The
  // list query no longer carries the (large) assistant_stream inline, so we
  // fetch bodies from their own table; because they never change after the run
  // completes this subscription isn't re-pushed when message metadata is patched.
  const bodyMessageIds = useMemo(
    () =>
      filteredThreadMessages
        .filter(
          (msg: any) => !msg.ad_payload && !(msg.assistant_stream?.length > 0),
        )
        .map((msg: any) => msg._id as Id<'agent_message'>),
    [filteredThreadMessages],
  )

  const messageBodies = useQuery(
    api.coding_agent.cli_agent.queries.getMessageBodies,
    hasActiveThread && bodyMessageIds.length > 0
      ? {
          semanticIdentifier: projectSemanticIdentifier,
          messageIds: bodyMessageIds,
        }
      : 'skip',
  )

  // Merge fetched bodies back onto the (lightweight) list messages so existing
  // rendering that reads message.assistant_stream keeps working unchanged.
  const hydratedThreadMessages = useMemo(() => {
    if (!messageBodies) return filteredThreadMessages
    return filteredThreadMessages.map((msg: any) => {
      if (msg.assistant_stream?.length > 0) return msg
      const body = messageBodies[msg._id]
      return body ? { ...msg, assistant_stream: body } : msg
    })
  }, [filteredThreadMessages, messageBodies])

  const filteredStreamedMessages = useMemo(() => {
    if (!streamingMessage) return []
    return streamingMessage.deactivated === true ? [] : [streamingMessage]
  }, [streamingMessage])

  // Combine and sort messages (oldest first for rendering)
  const sortedMessages = useMemo(() => {
    const allMessages = [...hydratedThreadMessages, ...filteredStreamedMessages]
    // Sort by _creationTime (oldest first for bottom-up rendering)
    return allMessages.sort((a, b) => a._creationTime - b._creationTime)
  }, [hydratedThreadMessages, filteredStreamedMessages])

  const activeAskUserQuestions = useMemo(() => {
    for (let i = sortedMessages.length - 1; i >= 0; i--) {
      const message = sortedMessages[i]
      if (message.ad_payload) continue
      if (String(message.state) !== 'Paused') return []
      const askUserItem = (
        (message.assistant_stream ?? []) as AssistantStreamItemType[]
      ).findLast((item) => item.type === 'ask_user')
      if (askUserItem) return parseAskUserQuestions(askUserItem.content)
      return []
    }
    return []
  }, [sortedMessages])

  useEffect(() => {
    onActiveAskUserQuestionsChange?.(activeAskUserQuestions)
  }, [activeAskUserQuestions, onActiveAskUserQuestionsChange])

  // Clickable follow-up suggestions from the latest completed run. Only shown
  // while the latest message is Completed — sending anything (including a
  // chip) starts a new run, which hides them again.
  const latestFollowups = useMemo(() => {
    for (let i = sortedMessages.length - 1; i >= 0; i--) {
      const message = sortedMessages[i]
      if (message.ad_payload) continue
      if (String(message.state) !== 'Completed') return []
      const item = (
        (message.assistant_stream ?? []) as AssistantStreamItemType[]
      ).findLast(isSuggestFollowupsItem)
      if (!item) return []
      return parseSuggestedFollowups(item.content)
    }
    return []
  }, [sortedMessages])

  const persistAgentAdMessage = useMutation(
    api.coding_agent.cli_agent.agent_message.persistAgentAdMessage,
  )
  const { data: session } = useSession()
  const attemptedAdSourceIdsRef = useRef<Set<string>>(new Set())
  const adFetchAttemptCountsRef = useRef<Map<string, number>>(new Map())
  const [liveAgentAds, setLiveAgentAds] = useState<LiveAgentAds | null>(null)

  const adsBySourceMessageId = useMemo(() => {
    const ads = new Map<string, AdsByPlacement>()
    sortedMessages.forEach((message) => {
      if (message.ad_source_message_id && message.ad_payload) {
        const placementId =
          message.ad_payload.placementId === 'agent-chat-after-assistant'
            ? 'agent-chat-after-assistant'
            : 'agent-chat-after-user'
        const sourceAds = ads.get(message.ad_source_message_id) ?? {}
        sourceAds[placementId] = message.ad_payload
        ads.set(message.ad_source_message_id, sourceAds)
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

  const adsForRenderingBySourceMessageId = useMemo(() => {
    const ads = new Map(adsBySourceMessageId)
    if (!liveAgentAds) return ads

    let matchingMessage = sortedMessages.find(
      (message) => message._id === liveAgentAds.sourceMessageId,
    )
    if (!matchingMessage) {
      matchingMessage = [...sortedMessages]
        .reverse()
        .find(
          (message) =>
            message.user_message?.trim() === liveAgentAds.userMessage &&
            Math.abs(message._creationTime - liveAgentAds.sourceCreationTime) <
              60000,
        )
    }
    if (!matchingMessage) return ads

    ads.set(matchingMessage._id, {
      ...liveAgentAds.ads,
      ...(ads.get(matchingMessage._id) ?? {}),
    })
    return ads
  }, [adsBySourceMessageId, liveAgentAds, sortedMessages])

  const sourceMessageForAd = useMemo(() => {
    for (let i = sortedMessages.length - 1; i >= 0; i--) {
      const message = sortedMessages[i]
      if (isClientOnlyAgentMessage(message)) continue
      if (message.ad_payload) continue
      if (!message.user_message) continue
      const sourceAds = adsBySourceMessageId.get(message._id)
      if (
        sourceAds?.['agent-chat-after-user'] &&
        sourceAds?.['agent-chat-after-assistant']
      ) {
        continue
      }
      return message
    }

    return null
  }, [adsBySourceMessageId, sortedMessages])

  useEffect(() => {
    if (!project?.active_agent_thread || !sourceMessageForAd) return

    const sourceMessageId = sourceMessageForAd._id

    const gravityMessages = buildGravityMessagesForAgentAd(sourceMessageForAd)
    if (gravityMessages.length === 0) return

    const existingAds = adsBySourceMessageId.get(sourceMessageId) ?? {}
    const placements: AgentAdPlacement[] = [
      'agent-chat-after-user',
      'agent-chat-after-assistant',
    ]
    const missingPlacements = placements.filter((placementId) => {
      if (existingAds[placementId]) return false
      const attemptKey = `${sourceMessageId}:${placementId}`
      return (
        !attemptedAdSourceIdsRef.current.has(attemptKey) &&
        (adFetchAttemptCountsRef.current.get(attemptKey) ?? 0) < 3
      )
    })

    if (missingPlacements.length === 0) return

    missingPlacements.forEach((placementId) => {
      const attemptKey = `${sourceMessageId}:${placementId}`
      attemptedAdSourceIdsRef.current.add(attemptKey)
      adFetchAttemptCountsRef.current.set(
        attemptKey,
        (adFetchAttemptCountsRef.current.get(attemptKey) ?? 0) + 1,
      )
    })
    void (async () => {
      let gravityContext: GravityContext | undefined
      try {
        gravityContext = await buildGravityContext({
          sessionId: `${project.active_agent_thread}-${sourceMessageId}`,
          userId: session?.user?.id,
          email: session?.user?.email,
        })
      } catch {
        gravityContext = undefined
      }

      return fetchGravityAds(
        gravityMessages,
        `${project.active_agent_thread}-${sourceMessageId}`,
        undefined,
        gravityContext,
        'freebuff_web_chat',
      )
    })()
      .then(async (ads) => {
        const seenCreativeIds = new Set(
          Object.values(existingAds)
            .filter((ad): ad is PersistedAgentAd => !!ad)
            .map(getAdCreativeIdentity),
        )
        const uniqueAds = ads.filter((ad) => {
          const identity = getAdCreativeIdentity(ad)
          if (seenCreativeIds.has(identity)) return false
          seenCreativeIds.add(identity)
          return true
        })
        const adsByPlacement = new Map<AgentAdPlacement, GravityAd>()
        const unassignedAds: GravityAd[] = []
        uniqueAds.forEach((ad) => {
          const placementId = ad.placementId
            ? GRAVITY_CHAT_PLACEMENT_TO_AGENT_PLACEMENT[ad.placementId]
            : undefined
          if (placementId && missingPlacements.includes(placementId)) {
            adsByPlacement.set(placementId, ad)
          } else {
            unassignedAds.push(ad)
          }
        })

        const fetchedAds: AdsByPlacement = {}
        missingPlacements.forEach((placementId) => {
          const ad = adsByPlacement.get(placementId) ?? unassignedAds.shift()
          if (!ad) return
          fetchedAds[placementId] = toPersistedAgentAd(ad, placementId)
        })
        if (Object.keys(fetchedAds).length > 0) {
          setLiveAgentAds({
            sourceMessageId,
            sourceCreationTime: sourceMessageForAd._creationTime,
            userMessage: sourceMessageForAd.user_message?.trim() ?? '',
            ads: fetchedAds,
          })
        } else {
          return
        }

        const persistenceResults = await Promise.allSettled(
          missingPlacements.map(async (placementId) => {
            const ad = fetchedAds[placementId]
            if (!ad) return

            await persistAgentAdMessage({
              sourceMessageId,
              ad,
            })
          }),
        )
        if (persistenceResults.some((result) => result.status === 'rejected')) {
          warnAdClient(
            '[AgentChatMessages] Rendered Gravity ads before persistence completed',
          )
        }
      })
      .catch((error) => {
        missingPlacements.forEach((placementId) => {
          attemptedAdSourceIdsRef.current.delete(
            `${sourceMessageId}:${placementId}`,
          )
        })
        warnAdClient('[AgentChatMessages] Failed to fetch Gravity ads', error)
      })
  }, [
    adsBySourceMessageId,
    persistAgentAdMessage,
    project?.active_agent_thread,
    session?.user?.email,
    session?.user?.id,
    sourceMessageForAd,
  ])
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
              agentType: activeThread?.agent_type,
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
        <div ref={contentRef} className="px-4 pb-6 pt-3">
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
                  {messagesForRendering.map((message, index) => {
                    // Inline retry only for the latest message: failed runs
                    // earlier in history aren't actionable anymore.
                    const retryPrompt =
                      index === messagesForRendering.length - 1 &&
                      String(message.state) === 'Error' &&
                      message.user_message
                        ? message.user_message
                        : undefined
                    return (
                      <AgentMessageCard
                        key={message._id}
                        message={message}
                        ads={adsForRenderingBySourceMessageId.get(message._id)}
                        onRollback={rollbackCallbacks.get(message._id)}
                        onContinueAfterTimeout={() =>
                          onSendMessage(TIME_LIMIT_CONTINUE_MESSAGE)
                        }
                        onRetry={
                          retryPrompt
                            ? () => void onSendMessage(retryPrompt)
                            : undefined
                        }
                      />
                    )
                  })}

                  {/* Follow-up suggestion chips from the latest completed run */}
                  {latestFollowups.length > 0 && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {latestFollowups.map((followup) => (
                        <button
                          key={followup.prompt}
                          type="button"
                          title={followup.prompt}
                          onClick={() => void onSendMessage(followup.prompt)}
                          className="max-w-full truncate rounded-full border border-border/50 bg-card/40 px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-foreground"
                        >
                          {followup.label ??
                            (followup.prompt.length > 64
                              ? `${followup.prompt.slice(0, 61)}…`
                              : followup.prompt)}
                        </button>
                      ))}
                    </div>
                  )}
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
