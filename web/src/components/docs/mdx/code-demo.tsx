'use client'

interface CodeDemoProps {
  children: React.ReactNode
}

export function CodeDemo({ children }: CodeDemoProps) {
  return <div className="rounded-lg border bg-card px-4">{children}</div>
}
