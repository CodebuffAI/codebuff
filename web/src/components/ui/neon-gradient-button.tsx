'use client'

import { ButtonHTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface NeonGradientButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
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
  ...props
}: NeonGradientButtonProps) => {
  return (
    <button
      className={cn(
        'relative inline-flex items-center justify-center px-6 py-3 overflow-hidden rounded-lg transition-all duration-500',
        'bg-black hover:bg-gray-900',
        'text-white font-medium',
        className
      )}
      {...props}
    >
      <div
        className="absolute inset-0 w-full h-full transition-all duration-500"
        style={{
          background: `linear-gradient(90deg, ${neonColors.firstColor}, ${neonColors.secondColor})`,
          opacity: 0.15,
        }}
      />
      <div
        className="absolute inset-0 w-full h-full transition-all duration-500 opacity-0 hover:opacity-100"
        style={{
          background: `linear-gradient(90deg, ${neonColors.firstColor}, ${neonColors.secondColor})`,
          filter: 'blur(20px)',
          transform: 'translateY(20px) scale(0.95)',
        }}
      />
      <span className="relative z-10">{children}</span>
    </button>
  )
}
