import React from 'react'
import { cn } from '@/lib/utils'

interface TerminalOutputProps {
  children?: React.ReactNode
  className?: string
}

const TerminalOutput = ({
  children,
  className,
  ...props
}: TerminalOutputProps) => {
  return (
    <div className="react-terminal-line" {...props}>
      <p className={cn('text-wrap', className)}>{children}</p>
    </div>
  )
}

export default TerminalOutput
