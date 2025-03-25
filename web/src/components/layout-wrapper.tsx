'use client'

import { ReactNode } from 'react'
import { InstallDialog } from './ui/install-dialog'

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