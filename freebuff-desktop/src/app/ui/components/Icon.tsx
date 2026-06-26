/** Small inline-SVG icon set (15×15, inherits currentColor). */

const PATHS: Record<string, string> = {
  plus: 'M7.5 2.5v10M2.5 7.5h10',
  x: 'M3.5 3.5l8 8M11.5 3.5l-8 8',
  send: 'M7.5 12.5v-9M3.5 7.5l4-4 4 4',
  play: 'M4 3l8 4.5L4 12z',
  pr: 'M5 4.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0zM3.5 6v6M3.5 13.5a1.5 1.5 0 1 0 0-.01M11.5 6a1.5 1.5 0 1 0 0-.01M11.5 7.5v3.5',
  trash: 'M3 4.5h9M5.5 4.5V3h4v1.5M4.5 4.5l.5 8h5l.5-8',
  drag: 'M5.5 4.5h.01M9.5 4.5h.01M5.5 7.5h.01M9.5 7.5h.01M5.5 10.5h.01M9.5 10.5h.01',
  spark: 'M7.5 2l1.2 3.3L12 6.5 8.7 7.7 7.5 11 6.3 7.7 3 6.5l3.3-1.2z',
  check: 'M3 8l3 3 6-7',
  up: 'M7.5 11.5v-8M4 7l3.5-3.5L11 7',
  edit: 'M10.5 2.5l2 2-7 7-2.5.5.5-2.5z',
  folder: 'M2 4.5h4l1.2 1.5H13v6.5H2z',
  dot: 'M7.5 7.5h.01',
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
