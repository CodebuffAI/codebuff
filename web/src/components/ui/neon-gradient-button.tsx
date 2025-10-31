'use client'

import type { ButtonHTMLAttributes } from 'react'

import { cn } from '@/lib/utils'

interface NeonGradientButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement> {
  neonColors?: {
    firstColor: string
    secondColor: string
  }
}

export const NeonGradientButton = ({
  children,
  className,
  neonColors = {
    firstColor: '#ff00aa',
    secondColor: '#00FFF1',
  },
  disabled,
  ...props
}: NeonGradientButtonProps) => {
  return (
    <button
      className={cn(
        'relative z-10 rounded-[var(--border-radius)] inline-block',
        className,
        disabled ? 'cursor-not-allowed' : 'cursor-pointer',
      )}
      style={
        {
          '--border-size': '2px',
          '--border-radius': '0.5rem',
          '--neon-first-color': neonColors.firstColor,
          '--neon-second-color': neonColors.secondColor,
        } as React.CSSProperties
      }
      disabled={disabled}
      {...props}
    >
      <div
        className={cn(
          'relative rounded-[var(--card-content-radius)]',
          'bg-primary text-primary-foreground hover:bg-primary/90',
          'before:absolute before:-left-[var(--border-size)] before:-top-[var(--border-size)] before:-z-10 before:block',
          'before:h-[var(--pseudo-element-height)] before:w-[var(--pseudo-element-width)] before:rounded-[var(--border-radius)] before:content-[""]',
          'before:bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] before:bg-[length:100%_200%]',
          'before:animate-background-position-spin',
          'after:absolute after:-left-[var(--border-size)] after:-top-[var(--border-size)] after:-z-10 after:block',
          'after:h-[var(--pseudo-element-height)] after:w-[var(--pseudo-element-width)] after:rounded-[var(--border-radius)] after:blur-[var(--after-blur)] after:content-[""]',
          'after:bg-[linear-gradient(0deg,var(--neon-first-color),var(--neon-second-color))] after:bg-[length:100%_200%] after:opacity-80',
          'after:animate-background-position-spin',
          'h-10 px-4 py-2 text-sm font-medium flex items-center justify-center', // Button-specific styles
        )}
        style={
          {
            '--card-content-radius': 'calc(0.5rem - 2px)',
            '--pseudo-element-width': 'calc(100% + 4px)',
            '--pseudo-element-height': 'calc(100% + 4px)',
            '--after-blur': '10px',
          } as React.CSSProperties
        }
      >
        {children}
      </div>
    </button>
  )
}
