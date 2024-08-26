import { ReactNode } from 'react'

export default function ImageWithBlurredShadow(props: { image: ReactNode }) {
  const { image } = props
  return (
    <div className="relative">
      {image}
      <div className="absolute right-0.5 top-0.5 -z-20 blur-sm">{image}</div>
    </div>
  )
}
