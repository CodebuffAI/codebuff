/** Small inline-SVG icon set (15×15, inherits currentColor). */

// Shared skeleton for the three PR glyphs: the left trunk (dot · line · dot).
// The variants differ only in what hangs off it (an open ring, a solid head, or
// an exclamation), so keeping the trunk in one place means a geometry tweak
// can't leave one glyph's trunk misaligned with the others'.
const PR_TRUNK =
  'M4 2.2a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z' + // top trunk dot
  'M4 5v5.2' + // trunk
  'M4 10.2a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z' // bottom trunk dot
// Open head: an arm curving from the trunk into the head column, ending in a ring.
const PR_OPEN_HEAD = 'M5.4 3.6h3.1A2.5 2.5 0 0111 6.1v4.1M11 10.2a1.4 1.4 0 100 2.8 1.4 1.4 0 000-2.8z'

const PATHS: Record<string, string> = {
  plus: 'M7.5 2.5v10M2.5 7.5h10',
  x: 'M3.5 3.5l8 8M11.5 3.5l-8 8',
  // Keyboard Return key: comes down the right, turns left, and ends in a
  // left-pointing arrow head (tip at the corner, barbs trailing back toward
  // the shaft), signaling "send with Enter".
  enter: 'M12 3v5H3M3 8L5 5.5M3 8L5 10.5',
  play: 'M4 3l8 4.5L4 12z',
  trash: 'M3 4.5h9M5.5 4.5V3h4v1.5M4.5 4.5l.5 8h5l.5-8',
  drag: 'M5.5 4.5h.01M9.5 4.5h.01M5.5 7.5h.01M9.5 7.5h.01M5.5 10.5h.01M9.5 10.5h.01',
  spark: 'M7.5 2l1.2 3.3L12 6.5 8.7 7.7 7.5 11 6.3 7.7 3 6.5l3.3-1.2z',
  check: 'M3 8l3 3 6-7',
  alert: 'M7.5 3v6M7.5 11.5h.01',
  up: 'M7.5 11.5v-8M4 7l3.5-3.5L11 7',
  'chevron-down': 'M4 6l3.5 3.5L11 6',
  edit: 'M10.5 2.5l2 2-7 7-2.5.5.5-2.5z',
  folder: 'M2 4.5h4l1.2 1.5H13v6.5H2z',
  dot: 'M7.5 7.5h.01',
  stop: 'M4 4h7v7H4z',
  copy: 'M5 5.5h6.5V12H5zM3.5 9.5V3h6',
  menu: 'M3 4.5h9M3 7.5h9M3 10.5h9',
  down: 'M4 6l3.5 3.5L11 6',
  search: 'M6.75 11a4.25 4.25 0 100-8.5 4.25 4.25 0 000 8.5zM10 10l2.5 2.5',
  download: 'M7.5 2.5v6.5M4.5 6.5l3 3 3-3M3 12.5h9',
  paperclip:
    'M11.5 6.5l-5 5a2.5 2.5 0 01-3.5-3.5l5.5-5.5a1.6 1.6 0 012.3 2.3l-5.2 5.2a0.7 0.7 0 01-1-1l4.7-4.7',
  image: 'M2.5 3.5h10v8h-10zM5.6 6.3a0.9 0.9 0 100-1.8 0.9 0.9 0 000 1.8M3 11l2.7-2.7 2 2 2-2 2.3 2.3',
  file: 'M4 2.5h4l3 3v7H4zM8 2.5v3h3',
  // GitHub-style "pull request open" — the trunk plus an arm into the head
  // column ending in an open ring. All coords sit inside 2–13.5 of the 15×15
  // box so nothing clips when the tab chip scales it down to 11px.
  'pr-open': PR_TRUNK + PR_OPEN_HEAD,
  // Merged variant — the open head, plus a small inner dot (a zero-length
  // segment rendered as a round point by the stroke-linecap) so the head reads
  // as solid / "merged".
  'pr-merged': PR_TRUNK + PR_OPEN_HEAD + 'M11 11.6h.01',
  // Conflict variant — trunk intact, but the head column becomes an exclamation
  // (stem + dot): "the PR's head has a problem" (merge conflicts).
  'pr-conflict': PR_TRUNK + 'M11 2.5v6' + 'M11 12.4h.01',
  // Queued-prompts list: full lines with a shorter last one, "more to come".
  list: 'M3 4.5h9M3 7.5h9M3 10.5h5',
  // Person silhouette: head circle over a shoulders arc.
  user: 'M7.5 2.9a2.1 2.1 0 100 4.2 2.1 2.1 0 000-4.2zM3.2 12.5a4.3 4.3 0 018.6 0',
  // 8-toothed gear, slightly stylized. ~15x15 viewBox.
  settings:
    'M7.5 2v1.8M7.5 11.2V13M2 7.5h1.8M11.2 7.5H13M3.7 3.7l1.3 1.3M9.9 9.9l1.3 1.3M3.7 11.3l1.3-1.3M9.9 5.1l1.3-1.3M7.5 5.5a2 2 0 100 4 2 2 0 000-4z',
}

export function Icon({ name, className }: { name: string; className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name] ?? ''} />
    </svg>
  )
}
