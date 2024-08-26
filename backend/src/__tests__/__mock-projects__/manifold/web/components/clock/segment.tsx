import React from 'react'
import { segmentStyle, skewedSegmentStyle } from './segment-style'

type SegmentType = {
  active: boolean
  color: string
  size: number
  id: string
  skew: boolean
}

const Segment = ({ active, color, size, id, skew }: SegmentType) => {
  const ss = skew ? skewedSegmentStyle[id] : segmentStyle[id]

  const outerStyle = {
    filter: active ? `drop-shadow(0px 0px ${size * 0.3}px ${color})` : 'none',
    padding: size * 0.3,
    width: 'fit-content',
    position: ss.id ? 'absolute' : 'relative',
    transform: ss.transform,
    marginTop: `${size * ss.marginTop}px`,
    marginLeft: `${size * ss.marginLeft}px`,
    zIndex: '2',
  } as React.CSSProperties

  const innerStyle = {
    backgroundColor: color,
    filter: active ? 'opacity(1) grayscale(0)' : 'opacity(0.2) grayscale(0.8)',
    color: color,
    clipPath: ss.clipPath,
    WebkitClipPath: ss.clipPath,
    MozClipPath: ss.clipPath,
    height: `${size}px`,
    width: `${size * 5}px`,
  } as React.CSSProperties

  return (
    <div style={outerStyle}>
      <div style={innerStyle}></div>
    </div>
  )
}

export default Segment
