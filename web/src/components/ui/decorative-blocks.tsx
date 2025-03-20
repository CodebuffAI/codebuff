'use client'

import { cn } from '@/lib/utils'
import { useEffect, useState, useRef, ReactNode, useMemo } from 'react'

interface Block {
  color: BlockColor
  width: number
  height: number
  top: number
  left: number
  zIndex?: number
}

type InitialPlacement =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export enum BlockColor {
  White = 'rgb(255, 255, 255)', // #FFFFFF
  Black = 'rgb(0, 0, 0)', // #000000
  GenerativeGreen = 'rgb(18, 73, 33)', // #124921
  CRTAmber = 'rgb(255, 110, 11)', // #FF6E0B
  DarkForestGreen = 'rgba(3, 29, 10, 1)', // #031D0A
  AcidMatrix = 'rgba(124, 255, 63, 1)', // #7CFF3F
  TerminalYellow = 'rgba(246, 255, 74, 1)', // #F6FF4A
}

// Base props that are always allowed
interface BaseDecorativeBlocksProps {
  className?: string
  initialPlacement?: InitialPlacement
  children: ReactNode
}

// Props with density
interface DensityProps extends BaseDecorativeBlocksProps {
  density: 'low' | 'medium' | 'high'
  colors?: never
}

// Props with colors
interface ColorsProps extends BaseDecorativeBlocksProps {
  colors: BlockColor[]
  density?: never
}

type DecorativeBlocksProps = DensityProps | ColorsProps

const defaultColors = [
  BlockColor.GenerativeGreen,
  BlockColor.CRTAmber,
  BlockColor.DarkForestGreen,
]

const densityMap = {
  low: 2,
  medium: 4,
  high: 6,
} as const

type Density = keyof typeof densityMap

export function DecorativeBlocks(props: DecorativeBlocksProps) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const childrenRef = useRef<HTMLDivElement>(null)

  const { blockCount, colorPalette } = useMemo(() => {
    if ('density' in props && props.density) {
      return {
        blockCount: densityMap[props.density],
        colorPalette: defaultColors,
      }
    }
    return {
      blockCount: props.colors.length,
      colorPalette: props.colors,
    }
  }, [props])

  const getOffsets = (index: number) => {
    const baseOffset = 8 // Now hardcoded
    const stackOffset = index * 8

    switch (props.initialPlacement) {
      case 'top-right':
        return {
          top: -baseOffset - stackOffset,
          left: baseOffset + stackOffset,
        }
      case 'bottom-left':
        return {
          top: baseOffset + stackOffset,
          left: -baseOffset - stackOffset,
        }
      case 'bottom-right':
        return { top: baseOffset + stackOffset, left: baseOffset + stackOffset }
      case 'top-left':
      default:
        return {
          top: -baseOffset - stackOffset,
          left: -baseOffset - stackOffset,
        }
    }
  }

  useEffect(() => {
    if (!childrenRef.current) return

    const updateBlocks = () => {
      if (!childrenRef.current || !containerRef.current) return

      const rect = childrenRef.current.getBoundingClientRect()
      const newBlocks: Block[] = []

      const baseOffsets = getOffsets(0)
      newBlocks.push({
        color: colorPalette[0],
        width: rect.width,
        height: rect.height,
        ...baseOffsets,
        zIndex: -1,
      })

      for (let i = 1; i < blockCount; i++) {
        const offsets = getOffsets(i)
        const variation = i % 2 === 0 ? 1 : -1
        newBlocks.push({
          color: colorPalette[i],
          width: rect.width,
          height: rect.height,
          top: offsets.top + variation,
          left: offsets.left + variation,
          zIndex: -1 - i,
        })
      }

      setBlocks(newBlocks)
    }

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(updateBlocks)
    })

    resizeObserver.observe(childrenRef.current)
    window.addEventListener('resize', updateBlocks)
    updateBlocks()

    return () => {
      if (childrenRef.current) {
        resizeObserver.unobserve(childrenRef.current)
      }
      resizeObserver.disconnect()
      window.removeEventListener('resize', updateBlocks)
    }
  }, [blockCount, colorPalette, props.initialPlacement])

  return (
    <div className="relative w-full" ref={containerRef}>
      <div className={cn('absolute overflow-visible -z-10', props.className)}>
        {blocks.map((block, index) => {
          const nextColor =
            index < blocks.length - 1
              ? blocks[index + 1].color
              : adjustColorBrightness(block.color, -20)

          return (
            <div
              key={index}
              className="absolute"
              style={{
                background: `linear-gradient(165deg, ${block.color}, ${nextColor})`,
                width: `${block.width}px`,
                height: `${block.height}px`,
                top: `${block.top}px`,
                left: `${block.left}px`,
                opacity: 0.75,
                zIndex: block.zIndex || 0,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.1)',
                borderRadius: '2px',
                transition: 'opacity 0.3s ease-out',
              }}
            />
          )
        })}
      </div>
      <div ref={childrenRef}>{props.children}</div>
    </div>
  )
}

function adjustColorBrightness(color: string, amount: number): string {
  if (color.startsWith('rgba')) {
    const [r, g, b, a] = color.match(/[\d.]+/g)!.map(Number)
    return `rgba(${Math.max(0, Math.min(255, r + amount))}, ${Math.max(0, Math.min(255, g + amount))}, ${Math.max(0, Math.min(255, b + amount))}, ${a})`
  }
  const [r, g, b] = color.match(/\d+/g)!.map(Number)
  return `rgb(${Math.max(0, Math.min(255, r + amount))}, ${Math.max(0, Math.min(255, g + amount))}, ${Math.max(0, Math.min(255, b + amount))})`
}
