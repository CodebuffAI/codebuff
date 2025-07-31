'use client'

import { InstallDialog } from './ui/install-dialog'

import type { ReactNode } from 'react'

interface LayoutWrapperProps {
  children: ReactNode
}

export function LayoutWrapper({ children }: LayoutWrapperProps) {
  return (
    <>
      {children}
      <InstallDialog />
    </>
  )
}
