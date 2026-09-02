import {
  SPONSORED_STEP_STATE_LABEL,
  sponsoredProposalAction,
  sponsoredProposalMenu,
  sponsoredProposalViewModel,
} from '@codebuff/common/ads/sponsored-proposal-view'
import { TextAttributes } from '@opentui/core'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useState } from 'react'

import { useMessageBlockStore } from '../../state/message-block-store'
import { isPlainEnterKey } from '../../utils/terminal-enter-detection'
import { useTheme } from '../../hooks/use-theme'

import type { SponsoredProposalContentBlock } from '../../types/chat'
import type { SponsoredProposalMenuKey } from '@codebuff/common/ads/sponsored-proposal-view'
import type { KeyEvent } from '@opentui/core'

/**
 * The sponsored proposal card, in a terminal (COD-376).
 *
 * Every string here comes from the shared view model, so this is the SAME state
 * machine the web panel and the desktop card run — a card that reads
 * differently here is a bug rather than a port.
 *
 * THERE IS NO ACCEPT CONTROL. Phase 1 ships none: accepting spawns a thread in
 * an isolated Cloud workspace and the CLI runs against `process.cwd()`.
 *
 * AND WHILE THE MENU IS CLOSED THERE ARE NO KEY BINDINGS AT ALL. `useKeyboard`
 * is a GLOBAL listener, not a focus-scoped one, so the bare `m`, `esc` and
 * `enter` this card used to claim ran ALONGSIDE the composer's own global
 * handler rather than instead of it: typing the letter `m` into a prompt also
 * opened an ad's menu, and Esc reached the card as a decline while it was
 * cancelling something else entirely. A transcript block cannot own a bare key
 * on a surface whose input is always live.
 *
 * The controls are slash commands instead -- `/ads:proposal` opens this menu,
 * `/ads:dismiss-proposal` declines, and the three standing ones
 * (`/ads:report-proposal`, `/ads:never-advertiser`, `/ads:proposals-off`)
 * already existed. Once the menu IS open the card takes arrows, Enter and Esc,
 * and chat's keyboard is disabled for exactly that span, the same way
 * `askUser` does it -- so those keys reach one handler rather than two.
 *
 * A pull request URL is therefore printed and never opened by a keypress. That
 * is the R-15 waiver read honestly: this surface renders sanitized text the
 * user may copy, not a link and not a primary.
 *
 * Two things a terminal does differently from the other two surfaces, and both
 * are declared waivers rather than omissions:
 *   - the advertiser LOGO is never fetched (R-16/R-17): a token is not rendered
 *     as an image and no request is minted for one, so the advertiser's name is
 *     the whole of the attribution.
 *   - a pull request URL is printed as sanitized TEXT rather than a link
 *     (R-15). The sanitizing still holds: `pullRequestHref` is null for anything
 *     that is not absolute https, and nothing else is ever printed.
 */

/** The narrowest width the card is designed for; below it, body copy goes first. */
export const PROPOSAL_MIN_BODY_WIDTH = 40

const DISCLOSURE = 'SPONSORED'

/**
 * The narrowest an advertiser's name may be before the header stacks.
 *
 * Twelve, because that is `Acme Deploys` -- the shortest name in the shared
 * fixtures -- and a name clipped shorter than its own first word identifies
 * nobody, which is the half of the disclosure that actually names who is
 * advertising.
 */
const MIN_INLINE_NAME_WIDTH = 12

/** Clip to the available columns without wrapping — a terminal has no ellipsis box. */
function clip(text: string, width: number): string {
  if (width <= 1) return ''
  return text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`
}

export const SponsoredProposalBlock: React.FC<{
  block: SponsoredProposalContentBlock
  availableWidth: number
}> = ({ block, availableWidth }) => {
  const theme = useTheme()
  const callbacks = useMessageBlockStore((s) => s.callbacks)
  const [menuIndex, setMenuIndex] = useState(0)

  const view = sponsoredProposalViewModel(block.proposal)
  const width = Math.max(20, availableWidth)
  const menu = sponsoredProposalMenu(view.advertiserName)
  const openPullRequest = sponsoredProposalAction(view, 'open-pull-request')
  const answered = block.answered === true
  const busy = block.busy === true

  const onMenuKey = useCallback(
    (key: SponsoredProposalMenuKey) => {
      if (key === 'why') {
        callbacks.onSponsoredProposalDisclose(block.target, !block.whyOpen)
        return
      }
      callbacks.onSponsoredProposalControl(block.target, key)
    },
    [block.target, block.whyOpen, callbacks],
  )

  // ONLY WHILE THE MENU IS OPEN. `useKeyboard` registers a GLOBAL listener, so
  // anything bound here fires whatever the user is actually doing -- and chat's
  // composer has a global handler of its own, which does not stop firing
  // because a card exists. The bare bindings this replaced therefore reached
  // BOTH: `m` typed into a prompt also opened an ad menu, and Esc was read as a
  // decline while it was cancelling something else. An open menu is different
  // in kind: chat's keyboard is disabled for exactly that span (see `chat.tsx`,
  // the same `disabled` askUser uses), so these keys have one owner.
  useKeyboard(
    useCallback(
      (key: KeyEvent) => {
        if (!block.menuOpen) return
        const preventDefault = () => {
          if ('preventDefault' in key && typeof key.preventDefault === 'function') {
            key.preventDefault()
          }
        }

        // Esc closes the MENU and answers nothing. It used to dismiss, which
        // made the ordinary "I opened this by accident" gesture record a
        // decline the user never chose -- and, because the binding was global,
        // could do so from an Esc aimed at something else. Ctrl+C stays
        // unbound for the same reason it always was: in a terminal that is
        // "stop", not an answer to an ad.
        if (key.name === 'escape') {
          preventDefault()
          callbacks.onSponsoredProposalMenu(block.target, false)
          return
        }

        // A spent card keeps Esc above -- it must always be possible to close
        // the menu -- but activates nothing.
        if (answered || busy) return

        if (key.name === 'up') {
          preventDefault()
          setMenuIndex((index) => (index - 1 + menu.length) % menu.length)
          return
        }
        if (key.name === 'down') {
          preventDefault()
          setMenuIndex((index) => (index + 1) % menu.length)
          return
        }
        if (isPlainEnterKey(key)) {
          preventDefault()
          callbacks.onSponsoredProposalMenu(block.target, false)
          onMenuKey(menu[menuIndex]!.key)
        }
      },
      [
        answered,
        busy,
        block.menuOpen,
        block.target,
        callbacks,
        menu,
        menuIndex,
        onMenuKey,
      ],
    ),
  )

  // The menu opens on its first item every time it is OPENED -- and only then.
  // `/ads:proposal` does not remount the card, so without this a second open
  // would put the caret wherever the last one left it, on a different control
  // than the list visibly starts on. Tracked as a transition rather than
  // "reset whenever it is open", because the latter also fires after mount and
  // would undo a selection the user had already moved.
  const wasMenuOpen = React.useRef(block.menuOpen === true)
  React.useEffect(() => {
    const open = block.menuOpen === true
    if (open && !wasMenuOpen.current) setMenuIndex(0)
    wasMenuOpen.current = open
  }, [block.menuOpen])

  const inner = Math.max(1, width - 2)
  // At the narrowest widths the disclosure and the advertiser must both survive;
  // the body is what goes first and the headline is what goes last.
  const showBody = view.state === 'offered' && inner >= PROPOSAL_MIN_BODY_WIDTH
  const nameRoom = inner - DISCLOSURE.length - 1
  // STACKED, not squeezed. Sharing one row costs the advertiser's name a
  // character for every character of "SPONSORED", and at 20 columns that turned
  // `Acme Deploys` into `Acme De` butted straight against the marker with no
  // space between them -- which reads as one word and identifies nobody. Two
  // rows is the honest trade: the card is a line taller and both halves of the
  // disclosure are intact.
  const stackHeader = nameRoom < MIN_INLINE_NAME_WIDTH

  return (
    <box
      style={{
        width,
        flexDirection: 'column',
        borderStyle: 'single',
        borderColor: theme.muted,
        paddingLeft: 1,
        paddingRight: 1,
        overflow: 'hidden',
      }}
    >
      {stackHeader ? (
        <box style={{ width: '100%', flexDirection: 'column' }}>
          <text style={{ fg: theme.muted, wrapMode: 'none' }}>{DISCLOSURE}</text>
          <text
            style={{ fg: theme.foreground, wrapMode: 'none' }}
            attributes={TextAttributes.BOLD}
          >
            {clip(view.advertiserName, inner)}
          </text>
        </box>
      ) : (
        <box
          style={{
            width: '100%',
            flexDirection: 'row',
            justifyContent: 'space-between',
            overflow: 'hidden',
          }}
        >
          <text
            style={{ fg: theme.foreground, flexShrink: 1, wrapMode: 'none' }}
            attributes={TextAttributes.BOLD}
          >
            {clip(view.advertiserName, nameRoom)}
          </text>
          <text style={{ fg: theme.muted, flexShrink: 0, wrapMode: 'none' }}>
            {DISCLOSURE}
          </text>
        </box>
      )}

      <text style={{ fg: theme.muted, wrapMode: 'none' }}>
        {clip(view.title, inner)}
      </text>
      <text style={{ fg: theme.foreground }}>{clip(view.headline, inner)}</text>
      {showBody && <text style={{ fg: theme.muted }}>{view.body}</text>}

      {view.state === 'running' && view.steps.length > 0 && (
        <box style={{ width: '100%', flexDirection: 'column' }}>
          <text style={{ fg: theme.muted, wrapMode: 'none' }}>
            {`${view.doneStepCount}/${view.steps.length}`}
          </text>
          {view.steps.map((step) => (
            <text
              key={step.text}
              style={{ fg: theme.muted, wrapMode: 'none' }}
            >
              {clip(
                `${SPONSORED_STEP_STATE_LABEL[step.state]}  ${step.text}`,
                inner,
              )}
            </text>
          ))}
        </box>
      )}

      {view.state === 'committed' && (
        <text style={{ fg: theme.muted }}>
          {view.branch
            ? `Committed to ${view.branch}. Nothing was pushed to your repository.`
            : 'Committed to its own branch. Nothing was pushed to your repository.'}
        </text>
      )}
      {view.state === 'failed' && (
        <text style={{ fg: theme.muted }}>{view.failureReason}</text>
      )}

      {/* SANITIZED TEXT, not a link (R-15 is waived on this surface for exactly
          this reason). `pullRequestHref` is null for anything that is not
          absolute https, so nothing else ever reaches this line. */}
      {openPullRequest?.href && (
        <text style={{ fg: theme.muted, wrapMode: 'none' }}>
          {clip(`${openPullRequest.label}: ${openPullRequest.href}`, inner)}
        </text>
      )}

      {block.whyOpen && <text style={{ fg: theme.muted }}>{view.whyThis}</text>}

      {block.menuOpen && (
        <box style={{ width: '100%', flexDirection: 'column' }}>
          {menu.map((item, index) => (
            <text
              key={item.key}
              style={{
                fg: index === menuIndex ? theme.primary : theme.muted,
                wrapMode: 'none',
              }}
            >
              {clip(
                `${index === menuIndex ? '>' : ' '} ${item.label}`,
                inner,
              )}
            </text>
          ))}
        </box>
      )}

      {!answered && (
        <text style={{ fg: theme.muted, wrapMode: 'none' }}>
          {hintFor(block.menuOpen === true, inner)}
        </text>
      )}
    </box>
  )
}

/**
 * The hint line, and the reason it names COMMANDS rather than keys.
 *
 * While the menu is closed this card holds no key bindings at all, because a
 * transcript block sharing a terminal with a live composer cannot own a bare
 * letter. So the hint names the two slash commands that reach it. An open menu
 * is the one span where the card does own the keyboard, and the hint says so.
 *
 * It still never says "accept": `offered` has no primary on this surface, and
 * naming one that is not there is how a Phase 1 surface starts looking like it
 * can run a sponsored thread.
 */
export function hintFor(menuOpen: boolean, width = Infinity): string {
  // KEPT SHORT ON PURPOSE. `inner` is the card's content width less its
  // border, but the box also has a column of padding on each side, so a line
  // of exactly `inner` characters loses its last two to the frame. Every other
  // line here is short enough that it never showed; a hint naming two commands
  // is not, and `/ads:dismiss-proposa` teaches a command that does not exist.
  const full = menuOpen
    ? '↑↓ move · enter choose · esc close'
    : '/ads:proposal · /ads:dismiss-proposal'
  if (full.length <= width) return full
  // Clipping mid-token teaches the user a command that does not exist, which is
  // worse than a shorter line that names one real thing.
  const compact = menuOpen ? 'enter · esc' : '/ads:proposal'
  return compact.length <= width ? compact : ''
}
