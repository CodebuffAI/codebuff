export function Spacer(props: { className?: string; w?: number; h?: number }) {
  const { w, h, className } = props

  const width = w === undefined ? undefined : w * 0.25 + 'rem'
  const height = h === undefined ? undefined : h * 0.25 + 'rem'

  return <div style={{ width, height, flexShrink: 0 }} className={className} />
}
