import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import React from 'react'

import type { FileTreeNode } from '@codebuff/common/util/file'

import { ChatGptConnectBanner } from './chatgpt-connect-banner'
import { HelpBanner } from './help-banner'
import { PendingAttachmentsBanner } from './pending-attachments-banner'
import { useChatStore } from '../state/chat-store'

/**
 * Registry mapping input modes to their banner components.
 *
 * To add a new banner:
 * 1. Create the banner component using BottomBanner
 * 2. Add an entry here mapping the input mode to a render function
 *
 * Render functions receive context (like showTime) and return the component.
 */
const BANNER_REGISTRY: Record<
  string,
  (ctx: { showTime: number; fileTree?: FileTreeNode[] }) => React.ReactNode
> = {
  default: () => <PendingAttachmentsBanner />,
  image: () => <PendingAttachmentsBanner />,
  help: (ctx) => <HelpBanner fileTree={ctx.fileTree} />,
  ...(CHATGPT_OAUTH_ENABLED
    ? { 'connect:chatgpt': () => <ChatGptConnectBanner /> }
    : {}),
}

/**
 * Banner component that shows contextual information below the input box.
 * Shows mode-specific banners based on the current input mode.
 *
 * Uses a registry pattern for easy extensibility - add new banners by
 * updating BANNER_REGISTRY above.
 */
export const InputModeBanner = ({
  fileTree,
}: {
  fileTree?: FileTreeNode[]
} = {}) => {
  const inputMode = useChatStore((state) => state.inputMode)

  const renderBanner = BANNER_REGISTRY[inputMode]

  if (!renderBanner) {
    return null
  }

  return <>{renderBanner({ showTime: Date.now(), fileTree })}</>
}
