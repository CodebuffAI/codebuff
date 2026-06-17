import { cva, type VariantProps } from 'class-variance-authority'
import * as React from 'react'

import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-normal transition-colors',
  {
    variants: {
      variant: {
        default:
          'border-white/10 bg-white/[0.06] text-foreground/80',
        green:
          'border-forest/40 bg-forest/15 text-forest-bright',
        muted: 'border-white/5 bg-white/[0.03] text-muted-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
