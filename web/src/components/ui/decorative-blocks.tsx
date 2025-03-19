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
  Primary = 'rgb(18, 73, 33)', // #124921
  Accent = 'rgb(255, 110, 11)', // #FF6E0B
  Dark = 'rgba(3, 29, 10, 1)', // #031D0A
}

// Base props that are always allowed
interface BaseDecorativeBlocksProps {
  className?: string
  placement?: InitialPlacement
  children: ReactNode
}

// Props with density
interface DensityProps extends BaseDecorativeBlocksProps {
  density: 'low' | 'medium' | 'high'
  colors?: never // Explicitly disallow colors when density is provided
}

// Props with colors
interface ColorsProps extends BaseDecorativeBlocksProps {
  colors: BlockColor[]
  density?: never // Explicitly disallow density when colors is provided
}

// Union type that enforces either density or colors, but not both
type DecorativeBlocksProps = DensityProps | ColorsProps

const defaultColors = [BlockColor.Primary, BlockColor.Accent, BlockColor.Dark]

export function DecorativeBlocks(props: DecorativeBlocksProps) {
  const [blocks, setBlocks] = useState<Block[]>([])
  const containerRef = useRef<HTMLDivElement>(null)
  const childrenRef = useRef<HTMLDivElement>(null)

  // Determine the number of blocks and colors to use
  const { blockCount, colorPalette } = useMemo(() => {
    if ('density' in props) {
      const count = {
        low: 2,
        medium: 4,
        high: 6,
      }[props.density]
      return { blockCount: count, colorPalette: defaultColors }
    } else {
      return { blockCount: props.colors.length, colorPalette: props.colors }
    }
  }, [props])

  const getOffsets = (index: number) => {
    const baseOffset = 20
    const stackOffset = index * 15

    switch (props.placement) {
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

      // Base block that matches component size
      const baseOffsets = getOffsets(0)
      newBlocks.push({
        color: colorPalette[0],
        width: rect.width,
        height: rect.height,
        ...baseOffsets,
        zIndex: -1,
      })

      // Add stacked blocks
      for (let i = 1; i < blockCount; i++) {
        const offsets = getOffsets(i)
        newBlocks.push({
          color: colorPalette[i],
          width: rect.width,
          height: rect.height,
          ...offsets,
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
  }, [blockCount, colorPalette, props.placement])

  return (
    <div className="relative" ref={containerRef}>
      <div className={cn('absolute overflow-visible -z-10', props.className)}>
        {blocks.map((block, index) => (
          <div
            key={index}
            className="absolute bg-[length:100%_100%]"
            style={{
              background: block.color,
              width: `${block.width}px`,
              height: `${block.height}px`,
              top: `${block.top}px`,
              left: `${block.left}px`,
              transition: 'all 0.5s ease-out',
              zIndex: block.zIndex || 0,
              imageRendering: 'pixelated',
              WebkitFontSmoothing: 'none',
              MozOsxFontSmoothing: 'grayscale',
              backfaceVisibility: 'hidden',
              transform: 'translateZ(0)',
              filter: 'contrast(1.1)',
              boxShadow: 'inset 0 0 1px rgba(0,0,0,0.1)',
            }}
          />
        ))}
      </div>
      <div ref={childrenRef}>{props.children}</div>
    </div>
  )
}
