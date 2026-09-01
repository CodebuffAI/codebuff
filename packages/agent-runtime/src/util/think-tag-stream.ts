/**
 * Split a model's *content* stream into visible text and reasoning, for the
 * models that put their reasoning in `content` instead of `reasoning_content`.
 *
 * WHY THIS EXISTS. Reasoning reaches a client on exactly one path: a
 * `reasoning_delta` chunk, which every surface renders in its own thinking
 * box. That chunk is produced only from a provider's native reasoning field
 * (`reasoning_content` / `reasoning` / Responses-API summaries — see
 * openai-compatible-chat-language-model.ts). Nothing downstream ever inspects
 * `content`, so when a lane serves a thinking model WITHOUT populating the
 * native field, the whole chain of thought arrives as ordinary text and is
 * rendered as prose — usually with a bare `</think>` sitting in the middle of
 * it, because the chat template opened the block for the model and only the
 * close is generated. That is the "thinking escapes the thinking box" report.
 *
 * The leak is a property of the LANE, not the model: the DeepSeek direct lane
 * maps `reasoning_content` correctly, while the resold openai-compatible lanes
 * behind the same model id may not. So this cannot be a per-model catalog flag;
 * it has to be recognised from what actually arrives.
 *
 * THREE SHAPES, THREE RULES.
 *
 *  1. `<think>…</think>` — paired tags. Content between them is reasoning.
 *     Unambiguous, free, always on.
 *  2. A bare `<think>` that never closes. Two different events produce this:
 *     a thought truncated mid-stream, or the tag written as PROSE — docs that
 *     mention the tag, a quoted template, a lane with a broken chat template.
 *     The two are indistinguishable while the deltas arrive, so everything
 *     after the open is HELD rather than emitted (same mechanism as rule 3).
 *     A close settles the hold as reasoning. Past
 *     {@link EXPLICIT_OPEN_HOLD_CHARS} without one, the hold COMMITS as
 *     reasoning and the rest of the block streams live — a genuine chain of
 *     thought runs arbitrarily long, and buffering one until its close would
 *     freeze the thinking box for the whole trace. A step that ends still
 *     undecided (never closed, never crossed the bound) releases the hold as
 *     text, so an answer is delayed but never swallowed.
 *  3. An orphan `</think>` with no open tag — the DeepSeek shape above, where
 *     the open tag was consumed by the chat template's prefill. The text
 *     BEFORE it is reasoning, but by the time the marker arrives that text has
 *     already streamed. Handled by {@link ThinkTagStreamOptions.implicitOpen},
 *     which is armed only once this conversation has PROVEN the lane leaks
 *     (see {@link historyLeaksThinkTags}) and holds the head of the step back
 *     until the marker settles it. When the marker never comes the head is
 *     released as text, so an answer is delayed but never swallowed.
 *
 * With `implicitOpen` off — the default, and every step of every model that
 * does not leak — rule 3 degrades to stripping the marker: the prose before it
 * still renders as prose, but a literal `</think>` never reaches a transcript.
 */

const OPEN_TAG = '<think>'
const CLOSE_TAG = '</think>'

export type ThinkStreamSegment = {
  type: 'text' | 'reasoning'
  text: string
}

export interface ThinkTagStreamOptions {
  /**
   * Treat the stream as already inside a think block, so a first orphan
   * `</think>` closes it and everything before it is reasoning.
   *
   * Provisional, not a promise: while it holds, content is BUFFERED rather
   * than emitted, because the decision it is waiting on cannot be unmade once
   * a chunk has been sent. {@link ThinkTagStream.disarmImplicitOpen} and
   * {@link IMPLICIT_OPEN_BUDGET_CHARS} both give up on it and release the
   * buffer as text.
   */
  implicitOpen?: boolean
}

/**
 * How much content an open block may hold while its classification is
 * undecided, before the hold gives up.
 *
 * For the implicit head ({@link ThinkTagStreamOptions.implicitOpen}) the cap
 * bounds the wrong case: a leaked chain of thought runs well past it, so if
 * the orphan `</think>` has not arrived by here the step is answering, not
 * thinking, and the buffer is released as text.
 *
 * For an explicit `<think>` open the same magnitude is a latency cap, not a
 * size estimate: past it the hold commits as reasoning ({@link
 * EXPLICIT_OPEN_HOLD_CHARS}) rather than releasing as text, because a genuine
 * block legitimately runs long — the wrong case to bound is the waiting, not
 * the trace.
 */
export const IMPLICIT_OPEN_BUDGET_CHARS = 4000
export const EXPLICIT_OPEN_HOLD_CHARS = IMPLICIT_OPEN_BUDGET_CHARS

/**
 * Remove think scaffolding from a fragment, leaving everything else — including
 * surrounding whitespace — exactly as it was.
 *
 * Distinct from `stripThinkTags`, which trims: that one answers "is this whole
 * response nothing but scaffolding", while this one rewrites text that is still
 * going to be displayed.
 */
export function stripThinkScaffolding(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/<think>[\s\S]*$/g, '')
    .split(CLOSE_TAG)
    .join('')
}

/** Longest suffix of `text` that is a proper prefix of either tag — the part
 *  that must be held back because the next chunk may complete it. `"…done<"`
 *  and `"…done</thi"` are both a tag arriving one delta at a time. */
function partialTagSuffixLength(text: string): number {
  const max = Math.min(text.length, CLOSE_TAG.length - 1)
  for (let len = max; len > 0; len--) {
    const suffix = text.slice(text.length - len)
    if (OPEN_TAG.startsWith(suffix) || CLOSE_TAG.startsWith(suffix)) {
      return len
    }
  }
  return 0
}

/**
 * True when an assistant turn in this history leaked a think marker into its
 * visible content — an orphan `</think>` left over after every properly paired
 * block is removed.
 *
 * This is the arming signal for `implicitOpen`. It reads the history rather
 * than a model id on purpose: the same model id leaks or does not depending on
 * which lane served it, and the history is the only place that answers for the
 * lane actually in use. It is also why the leak is left INTACT in the message
 * history while being stripped from the display stream — the evidence has to
 * survive for the next step to find it.
 */
export function historyLeaksThinkTags(
  messages: readonly { role: string; content: unknown }[],
): boolean {
  for (const message of messages) {
    if (message.role !== 'assistant' || !Array.isArray(message.content)) {
      continue
    }
    for (const part of message.content) {
      if (
        !part ||
        typeof part !== 'object' ||
        (part as { type?: unknown }).type !== 'text'
      ) {
        continue
      }
      const text = (part as { text?: unknown }).text
      if (typeof text !== 'string' || !text.includes(CLOSE_TAG)) continue
      // Only the HEAD of the message counts. A leaked chain of thought is what
      // the step opens with, so its close lands inside the same window the
      // speculation is willing to hold; a `</think>` further in is someone
      // quoting one — a bug report about this very problem, a diff, a doc — and
      // must not arm the next step against a model that never leaked.
      const head = text.slice(0, IMPLICIT_OPEN_BUDGET_CHARS + CLOSE_TAG.length)
      if (!head.includes(CLOSE_TAG)) continue
      if (head.replace(/<think>[\s\S]*?<\/think>/g, '').includes(CLOSE_TAG)) {
        return true
      }
    }
  }
  return false
}

/**
 * Incremental classifier over one step's content stream.
 *
 * Feed it every text delta; it returns the segments that are safe to emit now.
 * Adjacent segments of the same type are merged so a caller sends one event per
 * delta in the common case. Call {@link flush} once the step's text is done.
 */
export class ThinkTagStream {
  /** Trailing bytes withheld because they may be the start of a tag. */
  private partial = ''
  /** Content withheld while the classification of an open block is still
   *  undecided: the implicit head, or everything since an explicit open. */
  private held = ''
  private implicitOpen: boolean
  private inThinkBlock: boolean
  /** True while `held` is waiting for the close that settles its
   *  classification. Armed by construction (implicitOpen) and by every open
   *  tag; settled by the close or by the explicit hold bound
   *  ({@link confirmOpenHold}), or given up ({@link abandonOpenHold}) —
   *  budget, a native reasoning chunk, or flush. */
  private holdingForOpen: boolean

  constructor(options: ThinkTagStreamOptions = {}) {
    this.implicitOpen = options.implicitOpen ?? false
    this.inThinkBlock = this.implicitOpen
    this.holdingForOpen = this.implicitOpen
  }

  /**
   * Give up on the hold and release anything held as text.
   *
   * Called when the step turns out not to be thinking in `content` after all.
   * The strongest such signal is a native reasoning chunk: a lane that
   * populates `reasoning_content` is by definition not putting the thought in
   * `content`, so whatever is in `content` is the answer.
   */
  disarmImplicitOpen(): ThinkStreamSegment[] {
    if (!this.holdingForOpen) return []
    return this.abandonOpenHold()
  }

  push(chunk: string): ThinkStreamSegment[] {
    if (!chunk) return []
    const segments: ThinkStreamSegment[] = []
    let buffer = this.partial + chunk
    this.partial = ''

    while (buffer.length > 0) {
      if (this.inThinkBlock) {
        const closeIdx = buffer.indexOf(CLOSE_TAG)
        if (closeIdx === -1) break
        this.addReasoning(segments, buffer.slice(0, closeIdx))
        buffer = buffer.slice(closeIdx + CLOSE_TAG.length)
        this.inThinkBlock = false
        // The close the hold was waiting for: everything held is confirmed
        // reasoning — whether the block was opened implicitly (a leaked chain
        // of thought) or explicitly. A later orphan close is an ordinary
        // stray marker and is stripped below.
        this.confirmOpenHold(segments)
        continue
      }

      const openIdx = buffer.indexOf(OPEN_TAG)
      const closeIdx = buffer.indexOf(CLOSE_TAG)
      if (openIdx === -1 && closeIdx === -1) break
      if (openIdx !== -1 && (closeIdx === -1 || openIdx < closeIdx)) {
        this.addText(segments, buffer.slice(0, openIdx))
        buffer = buffer.slice(openIdx + OPEN_TAG.length)
        this.inThinkBlock = true
        // An open tag could be a block the model is thinking in, or the tag
        // quoted as prose. Both look identical until a close (or the end of
        // the step) settles it, so hold from here rather than committing the
        // rest of the step to the thinking box.
        this.holdingForOpen = true
        continue
      }
      // Orphan close with nothing to close: drop the marker so it cannot reach
      // a transcript as prose, and keep the text around it as text.
      this.addText(segments, buffer.slice(0, closeIdx))
      buffer = buffer.slice(closeIdx + CLOSE_TAG.length)
    }

    const hold = partialTagSuffixLength(buffer)
    this.partial = buffer.slice(buffer.length - hold)
    const rest = buffer.slice(0, buffer.length - hold)
    if (this.inThinkBlock) this.addReasoning(segments, rest)
    else this.addText(segments, rest)
    return segments
  }

  /** Emit everything withheld. A partial tag that never completed was always
   *  just text — except inside a block that committed as reasoning, where a
   *  truncated close belongs with the trace it would have ended. Content
   *  held for a close that never came is the answer: releasing it here is
   *  what makes the hold lossless. An unclosed open is treated exactly like
   *  an orphan close — the marker is scaffolding, the text around it is the
   *  answer. */
  flush(): ThinkStreamSegment[] {
    const segments: ThinkStreamSegment[] = []
    if (this.holdingForOpen) segments.push(...this.abandonOpenHold())
    const trailing = this.partial
    this.partial = ''
    if (trailing) {
      if (this.inThinkBlock) this.addReasoning(segments, trailing)
      else this.addText(segments, trailing)
    }
    return segments
  }

  /** The close arrived — or the hold bound crossed without one: what was
   *  held was reasoning after all, and the rest of the block streams live. */
  private confirmOpenHold(segments: ThinkStreamSegment[]): void {
    if (!this.holdingForOpen) return
    this.holdingForOpen = false
    this.implicitOpen = false
    const held = this.held
    this.held = ''
    if (held) push(segments, 'reasoning', held)
  }

  /** No close is coming: what was held was the answer. */
  private abandonOpenHold(): ThinkStreamSegment[] {
    this.holdingForOpen = false
    this.implicitOpen = false
    this.inThinkBlock = false
    const held = this.held
    this.held = ''
    return held ? [{ type: 'text', text: held }] : []
  }

  private addReasoning(segments: ThinkStreamSegment[], text: string): void {
    // A nested/duplicated open tag inside a block is scaffolding, never thought.
    const cleaned = text.split(OPEN_TAG).join('')
    if (!cleaned) return
    if (!this.holdingForOpen) {
      push(segments, 'reasoning', cleaned)
      return
    }
    // Undecided: reasoning only if a close confirms it, so hold rather than
    // send. Two give-up points settle it, in opposite directions. The
    // implicit-head budget releases as TEXT — a held chain of thought from a
    // leaking lane runs well past it, so past the budget the step is
    // answering, not thinking. The explicit-open hold COMMITS as reasoning —
    // a genuine block runs arbitrarily long, and buffering one until its
    // close would freeze the thinking box for the whole trace, so past the
    // bound the paired-block reading wins and the rest streams live.
    this.held += cleaned
    if (this.implicitOpen && this.held.length >= IMPLICIT_OPEN_BUDGET_CHARS) {
      segments.push(...this.abandonOpenHold())
    } else if (
      !this.implicitOpen &&
      this.held.length >= EXPLICIT_OPEN_HOLD_CHARS
    ) {
      this.confirmOpenHold(segments)
    }
  }

  private addText(segments: ThinkStreamSegment[], text: string): void {
    if (!text) return
    push(segments, 'text', text)
  }
}

/** Append, merging into the tail when the type matches so a caller sends one
 *  event per delta in the common case. */
function push(
  segments: ThinkStreamSegment[],
  type: ThinkStreamSegment['type'],
  text: string,
): void {
  const last = segments[segments.length - 1]
  if (last && last.type === type) last.text += text
  else segments.push({ type, text })
}
