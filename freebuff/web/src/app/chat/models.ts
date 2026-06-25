import {
  FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID,
  FREEBUFF_MINIMAX_M3_MODEL_ID,
} from '@codebuff/common/constants/freebuff-models'

import type { FreebuffAccessTier } from '@codebuff/common/constants/freebuff-models'

/**
 * Models available in freebuff.com/chat. Client-safe (no secrets). The
 * base-chat agent runs with `backendId` (see src/server/chat/agent.ts).
 *
 * There's no picker: the server picks the model from the user's access tier
 * (full → MiniMax M3, limited → DeepSeek Flash). The array/lookup shape is kept
 * so adding a picker back later is a local change.
 */
export interface ChatModelOption {
  /** Stable chat-product id (persisted on chat_thread/chat_message.model). */
  id: string
  /** Model id sent through the agent framework / completions endpoint. */
  backendId: string
}

export const CHAT_MODELS: ChatModelOption[] = [
  {
    id: 'minimax-m3',
    // Served by Fireworks; vision-capable. Used for full-access users.
    backendId: FREEBUFF_MINIMAX_M3_MODEL_ID,
  },
  {
    id: 'deepseek-v4-flash',
    // Served by Fireworks; text-only. Used for limited-access users.
    backendId: FREEBUFF_DEEPSEEK_V4_FLASH_FIREWORKS_MODEL_ID,
  },
]

/** Full-access model (vision-capable, so image upload works). */
export const DEFAULT_CHAT_MODEL_ID = 'minimax-m3'

/** Limited-access users (unsupported countries, VPN/proxy) are pinned to this
 *  text-only model and can't upload images. */
export const LIMITED_CHAT_MODEL_ID = 'deepseek-v4-flash'

/** The model a run uses, chosen purely by access tier (no client input). */
export function chatModelForAccessTier(accessTier: FreebuffAccessTier): string {
  return accessTier === 'full' ? DEFAULT_CHAT_MODEL_ID : LIMITED_CHAT_MODEL_ID
}

/** Resolves a chat-product model id to the backend id sent through the agent
 *  framework. Returns null for an unknown id; callers decide whether that's
 *  fatal (runChatAgent throws) or skippable (title generation no-ops). */
export function chatBackendModelId(modelId: string): string | null {
  return CHAT_MODELS.find((m) => m.id === modelId)?.backendId ?? null
}

/** Image-upload constraints, shared by the composer and the upload endpoint. */
export const CHAT_IMAGE_ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const
/** Membership-test form of CHAT_IMAGE_ALLOWED_TYPES for validation call sites. */
export const CHAT_IMAGE_ALLOWED_TYPES_SET: ReadonlySet<string> = new Set(
  CHAT_IMAGE_ALLOWED_TYPES,
)
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024 // 10 MB per image
export const CHAT_IMAGE_MAX_COUNT = 4 // images per message

export const CHAT_MESSAGE_MAX_CHARS = 32_000

/** Max length of a sidebar thread title, in code points. */
export const THREAD_TITLE_MAX_CODEPOINTS = 60

/** Code-point-safe truncation (with an ellipsis) so the cut can't split an
 *  emoji/surrogate pair. Returns the input unchanged when within the limit. */
export function truncateThreadTitle(
  text: string,
  max = THREAD_TITLE_MAX_CODEPOINTS,
): string {
  const codePoints = [...text]
  return codePoints.length > max
    ? `${codePoints.slice(0, max).join('').trimEnd()}…`
    : text
}
/**
 * Document (non-image file) upload constraints, shared by the composer and the
 * upload endpoint. Documents are converted to text server-side (see
 * src/server/chat/extract.ts) and given to the agent either inline (small
 * files) or via a search tool (large files), so the agent never has to hold a
 * whole long file in context.
 *
 * Browsers report wildly inconsistent MIME types for code/text files (a .ts
 * file is often `video/mp2t`, a .py file is often empty), so document detection
 * keys off the file extension first. Phase 1 covers plain-text/code/data
 * formats; richer formats (PDF, DOCX) are extracted in Phase 2.
 */
export const CHAT_DOC_ALLOWED_EXTENSIONS = [
  // Rich documents (extracted via dedicated parsers — see extract.ts)
  '.pdf',
  '.docx',
  // Plain text & docs
  '.txt',
  '.text',
  '.md',
  '.markdown',
  '.rst',
  '.log',
  // Data / config
  '.csv',
  '.tsv',
  '.json',
  '.jsonl',
  '.ndjson',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.env',
  '.properties',
  // Web
  '.html',
  '.htm',
  '.css',
  '.scss',
  '.sass',
  '.less',
  '.svg',
  // Code
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.py',
  '.rb',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.kts',
  '.scala',
  '.c',
  '.h',
  '.cc',
  '.cpp',
  '.cxx',
  '.hpp',
  '.cs',
  '.php',
  '.swift',
  '.m',
  '.mm',
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ps1',
  '.bat',
  '.sql',
  '.r',
  '.lua',
  '.pl',
  '.dart',
  '.ex',
  '.exs',
  '.erl',
  '.clj',
  '.hs',
  '.vue',
  '.svelte',
  '.graphql',
  '.gql',
  '.proto',
  '.tf',
  '.dockerfile',
] as const
/** Membership-test form of CHAT_DOC_ALLOWED_EXTENSIONS (lowercase). */
export const CHAT_DOC_ALLOWED_EXTENSIONS_SET: ReadonlySet<string> = new Set(
  CHAT_DOC_ALLOWED_EXTENSIONS,
)
/** MIME types that are unambiguously extractable text, used as a fallback when
 *  a file has no/odd extension. */
export const CHAT_DOC_ALLOWED_MIME_SET: ReadonlySet<string> = new Set([
  'text/plain',
  'text/markdown',
  'text/csv',
  'text/tab-separated-values',
  'application/json',
  'application/xml',
  'text/xml',
  'application/x-yaml',
  'text/yaml',
])
export const CHAT_DOC_MAX_BYTES = 5 * 1024 * 1024 // 5 MB per document
export const CHAT_DOC_MAX_COUNT = 5 // documents per message
/** Most-recent documents from a thread's history kept searchable on follow-up
 *  turns, so the agent can read/search files uploaded earlier in the
 *  conversation (not just in the current message). Their text is loaded lazily
 *  (only if the agent actually searches), so this bounds memory, not latency. */
export const CHAT_DOC_THREAD_SEARCH_MAX_FILES = 50
/** Cap on the TOTAL extracted text (chars) held in memory at once for a single
 *  search across a thread's files. Bounds peak memory when a thread has many or
 *  large prior files (the chat instance has a ~512MB ceiling); the most-recent
 *  files are kept up to this budget. ~16M chars ≈ 16 MB. */
export const CHAT_DOC_SEARCH_TOTAL_CHAR_BUDGET = 16_000_000

/** Lowercased file extension including the dot (e.g. ".ts"), or "" if none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return ''
  return name.slice(dot).toLowerCase()
}

/** Classifies an upload as an image, a (Phase 1) document, or unsupported.
 *  Shared by the composer (gating the picker) and the upload endpoint
 *  (authoritative validation). */
export function classifyAttachment(
  name: string,
  mimeType: string,
): 'image' | 'document' | null {
  if (CHAT_IMAGE_ALLOWED_TYPES_SET.has(mimeType)) return 'image'
  const ext = fileExtension(name)
  if (CHAT_DOC_ALLOWED_EXTENSIONS_SET.has(ext)) return 'document'
  if (CHAT_DOC_ALLOWED_MIME_SET.has(mimeType)) return 'document'
  // Common case: an extensionless dotfile like "Dockerfile" / "Makefile".
  const base = name.split('/').pop() ?? name
  if (/^(dockerfile|makefile|rakefile|gemfile|procfile)$/i.test(base)) {
    return 'document'
  }
  return null
}

/** When a message's combined extracted document text is at or under this many
 *  characters, the full text is inlined into the prompt. Above it, only a head
 *  excerpt is inlined and the agent uses the search_files tool to pull relevant
 *  sections — so a long file never has to sit whole in context. ~24k chars is
 *  roughly 6k tokens. */
export const CHAT_DOC_INLINE_CHAR_BUDGET = 24_000
/** Characters of each large document inlined as a head excerpt alongside the
 *  search tool, so the agent has immediate orientation (title, imports, shape)
 *  before it searches. */
export const CHAT_DOC_HEAD_CHARS = 4_000
/** Hard cap on extracted text per document; longer files are truncated (the
 *  tail is dropped) and flagged. Keeps one pathological upload from blowing out
 *  memory or the search index. ~1M chars ≈ 250k tokens. */
export const CHAT_DOC_MAX_TEXT_CHARS = 1_000_000

/** Placeholder sidebar title from the first user message, shown until the
 *  model-generated title arrives (see server/chat/title.ts). */
export function deriveThreadTitle(content: string): string {
  const firstLine = content.trim().split('\n')[0] ?? ''
  return firstLine ? truncateThreadTitle(firstLine) : 'Attachment'
}
