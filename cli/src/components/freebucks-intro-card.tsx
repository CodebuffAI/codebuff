import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import { useEffect, useState } from 'react'

import { FREEBUCKS_INTRO } from '../utils/freebucks'
import { hasSeenFreebucksIntro, markFreebucksIntroSeen } from '../utils/settings'
import { useTheme } from '../hooks/use-theme'

/**
 * The one-time introduction to Freebucks, above the picker on the landing.
 *
 * Shown the FIRST launch on which the account is METERED — the caller passes
 * `metered`, read off the session's `freebucks` block like every other
 * surface — and never again. The seen mark is written the moment this
 * RENDERS, not on dismissal: a launch that ends before the user presses
 * anything must not be shown it twice. It is a card and not a modal because
 * the CLI landing has no modal layer and the picker below it keeps working;
 * any key the picker handles also retires the card for this launch.
 */
export function FreebucksIntroCard({
  metered,
  width,
}: {
  metered: boolean
  width: number
}) {
  const theme = useTheme()
  const [show, setShow] = useState<boolean>(() => metered && !hasSeenFreebucksIntro())
  useEffect(() => {
    if (!metered) return
    if (hasSeenFreebucksIntro()) return
    markFreebucksIntroSeen()
    setShow(true)
  }, [metered])
  // Any key retires it for this launch; the picker still receives the key.
  useKeyboard(() => {
    if (show) setShow(false)
  })
  if (!show) return null
  return (
    <box
      style={{
        flexDirection: 'column',
        width: Math.max(24, width),
        border: true,
        borderStyle: 'rounded',
        borderColor: theme.secondary,
        paddingLeft: 1,
        paddingRight: 1,
        marginBottom: 1,
        flexShrink: 0,
      }}
    >
      <text style={{ fg: theme.foreground }} attributes={TextAttributes.BOLD}>
        ★ {FREEBUCKS_INTRO.title}
      </text>
      <text style={{ fg: theme.muted, wrapMode: 'word' }}>{FREEBUCKS_INTRO.lead}</text>
      {FREEBUCKS_INTRO.points.map((point) => (
        <text key={point} style={{ fg: theme.foreground, wrapMode: 'word' }}>
          <span fg={theme.secondary}>•</span> {point}
        </text>
      ))}
      <text style={{ fg: theme.muted }}>{FREEBUCKS_INTRO.dismiss}</text>
    </box>
  )
}
