/**
 * The headline accent word.
 *
 * The sponsor-break mockups render ONE word of the headline in the accent
 * colour ("Your next idea. *Live.*"). That is a real difference in what the
 * advertiser bought — the accent is the loudest pixel on a break card — so it
 * has to be authored, stored and reproduced rather than guessed at render
 * time.
 *
 * ## Why a markup rather than a second column
 *
 * A `title_accent_word` column has to answer "which occurrence?" the first
 * time an advertiser writes "Live. Really live." A span written INSIDE the
 * title cannot be ambiguous: it names a position, not a word. The title is
 * stored verbatim, markers included, so the authored intent survives an edit
 * round-trip through the console.
 *
 * ## Why one span, and one parser
 *
 * Three surfaces read the same string and only one of them can draw an accent:
 * the Desktop break cards can, and the CLI dock, the inline terminal card and
 * the house-ad width budget cannot. Every one of those has to receive the
 * PLAIN string — a terminal that prints `*Live.*` has shipped our markup to a
 * user. So the split and the strip live here, together, and every surface
 * imports one of the two rather than writing its own regex.
 *
 * More than one span is REFUSED at the console rather than rendered: two
 * accents is not an emphasis, it is a rainbow, and quietly honouring the first
 * would ship copy the advertiser did not preview. The renderers still degrade
 * safely — {@link splitAccentSpan} answers "no accent" for a title it will not
 * vouch for, and {@link stripAccentSpan} still removes the markers — because a
 * row written before this validation existed must not print asterisks.
 *
 * ## Character budgets count the PLAIN text
 *
 * `*` is markup, not copy. A 28-character break title with an accented last
 * word is 28 characters on screen and 30 in the database, and charging the
 * advertiser two characters for a formatting mark they never see is the kind
 * of limit nobody can explain. Callers of the break copy limits measure
 * {@link stripAccentSpan} of the title.
 */

/** One `*…*` run. Non-greedy by construction: the body may not contain `*`. */
const ACCENT_SPAN = /\*([^*]+)\*/g

export interface AccentSpanParts {
  /** Text before the accent — the whole plain title when there is no accent. */
  before: string
  /** The accented run, without its markers. Empty when there is no accent. */
  accent: string
  after: string
  /** The whole title with every marker removed. What non-accent surfaces get. */
  plain: string
}

/** How many well-formed spans a title carries. */
export function countAccentSpans(title: string): number {
  return title.match(ACCENT_SPAN)?.length ?? 0
}

/**
 * The title with the markers removed.
 *
 * Only PAIRED markers are removed. A lone `*` is left alone: an advertiser
 * writing "3 * 4 faster" wrote an asterisk on purpose, and silently deleting
 * it would corrupt copy to tidy up markup that is not there.
 */
export function stripAccentSpan(title: string): string {
  return title.replace(ACCENT_SPAN, '$1')
}

/**
 * Split a title into its accent parts. TOTAL: never throws, and never returns
 * an accent it is not sure about.
 *
 * A title with zero spans, or with more than one, comes back as plain text in
 * `before` with an empty `accent`. That is the same answer a surface that
 * cannot draw an accent would get, which is exactly the fallback wanted: an
 * unvouched-for title renders as ordinary copy, never as markup.
 */
export function splitAccentSpan(title: string): AccentSpanParts {
  const plain = stripAccentSpan(title)
  if (countAccentSpans(title) !== 1) {
    return { before: plain, accent: '', after: '', plain }
  }
  // Re-run without the global flag: a `g` regex carries `lastIndex` across
  // calls, and a shared module-level literal would answer differently on
  // every other invocation.
  const match = /\*([^*]+)\*/.exec(title)
  if (!match || match.index === undefined) {
    return { before: plain, accent: '', after: '', plain }
  }
  return {
    before: title.slice(0, match.index),
    accent: match[1] ?? '',
    after: title.slice(match.index + match[0].length),
    plain,
  }
}

/** Whether this title carries exactly one accent a surface may draw. */
export function hasAccentSpan(title: string): boolean {
  return splitAccentSpan(title).accent.length > 0
}

/**
 * Why this title's accent markup is not acceptable, in the advertiser's terms,
 * or null.
 *
 * Checked on write in the console, never at render: a stored row that predates
 * this rule still has to draw.
 */
export function accentSpanIssue(title: string): string | null {
  const spans = countAccentSpans(title)
  if (spans > 1) {
    return 'Accent one word only — remove the extra *asterisks* from this title.'
  }
  // An odd marker left over after the paired ones are consumed is a span the
  // advertiser started and did not close. Saying so beats rendering a stray
  // asterisk on a card they cannot edit from.
  if (stripAccentSpan(title).includes('*')) {
    return 'Close the accent with a second asterisk, like *this*.'
  }
  return null
}

/**
 * Apply an accent to `word` inside `title`, or clear it. What the console's
 * "Accent a word" control writes, so nobody is asked to type asterisks.
 *
 * The FIRST occurrence, matched on a word boundary, so accenting "Live" in
 * "Live it live" marks the word the advertiser clicked rather than a fragment
 * of another one. A word the title does not contain leaves the title alone.
 */
export function setAccentWord(title: string, word: string | null): string {
  const plain = stripAccentSpan(title)
  if (!word) return plain
  const target = word.trim()
  if (!target) return plain
  const at = accentWordOffset(plain, target)
  if (at < 0) return plain
  return `${plain.slice(0, at)}*${target}*${plain.slice(at + target.length)}`
}

/** Where a whole-word occurrence of `word` starts in `plain`, or -1. */
function accentWordOffset(plain: string, word: string): number {
  for (const candidate of accentWordCandidates(plain)) {
    if (candidate.text === word) return candidate.at
  }
  return -1
}

/**
 * The words of a title an advertiser may accent, in order, with their
 * offsets. Whitespace-separated runs — punctuation stays attached, because
 * the mockup's accent is "Live." with its full stop inside the colour.
 */
export function accentWordCandidates(
  title: string,
): { text: string; at: number }[] {
  const plain = stripAccentSpan(title)
  const words: { text: string; at: number }[] = []
  const pattern = /\S+/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(plain)) !== null) {
    words.push({ text: match[0], at: match.index })
  }
  return words
}
