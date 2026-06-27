import { useMemo, useRef, useState } from 'react'

import { buildCommands, filterCommands, type Command } from '../lib/commands'
import { useStore } from '../store/store'
import { Icon } from './Icon'
import { SlashMenu } from './SlashMenu'

export function Composer({ threadId }: { threadId: string }) {
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  // Set when the user dismisses the menu with Esc; reset on the next edit so a
  // fresh `/` reopens it.
  const [dismissed, setDismissed] = useState(false)
  const send = useStore((s) => s.send)
  const stopTurn = useStore((s) => s.stopTurn)
  const running = useStore((s) => s.threads[threadId]?.thread.turnState === 'running')
  const skills = useStore((s) => s.skills)
  const ref = useRef<HTMLTextAreaElement>(null)

  const commands = useMemo(() => buildCommands(skills), [skills])
  // The slash menu is active only when the input is a bare command token: a
  // leading `/` with no spaces yet (so multi-word prompts that merely start with
  // `/` don't trap the user in the menu).
  const slashQuery = /^\/(\S*)$/.exec(text)?.[1]
  const matches = useMemo(
    () => (slashQuery === undefined ? [] : filterCommands(commands, slashQuery)),
    [commands, slashQuery],
  )
  const menuOpen = slashQuery !== undefined && !dismissed && matches.length > 0
  // `sel` can lag behind a shrinking match list; clamp once for every consumer.
  const selected = Math.min(sel, matches.length - 1)

  const resetHeight = () => {
    if (ref.current) ref.current.style.height = 'auto'
  }

  const submit = () => {
    const t = text.trim()
    if (!t) return
    send(threadId, t)
    setText('')
    resetHeight()
  }

  const runCommand = (c: Command) => {
    const s = useStore.getState()
    switch (c.action.type) {
      case 'new-thread':
        void s.newThread()
        break
      case 'close-thread':
        s.closeTab(threadId)
        break
      case 'reopen-thread':
        s.reopenLast()
        break
      case 'skill':
        s.runSkill(threadId, c.action.name)
        break
    }
    setText('')
    setDismissed(false)
    resetHeight()
  }

  return (
    <div className="composer">
      {menuOpen && (
        <SlashMenu commands={matches} selected={selected} onSelect={runCommand} onHover={setSel} />
      )}
      <textarea
        ref={ref}
        value={text}
        rows={1}
        placeholder={running ? 'Send a message to steer the run…' : 'Type a message, or / for commands'}
        onChange={(e) => {
          setText(e.target.value)
          setDismissed(false)
          setSel(0)
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
        }}
        onKeyDown={(e) => {
          if (menuOpen) {
            const n = matches.length
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setSel((i) => (i + 1) % n)
              return
            }
            if (e.key === 'ArrowUp') {
              e.preventDefault()
              setSel((i) => (i - 1 + n) % n)
              return
            }
            if (e.key === 'Enter' || e.key === 'Tab') {
              e.preventDefault()
              runCommand(matches[selected])
              return
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              setDismissed(true)
              return
            }
          }
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      {running && !text.trim() ? (
        <button className="stop" onClick={() => stopTurn(threadId)} title="Stop the running turn">
          <Icon name="stop" />
        </button>
      ) : (
        <button className="send" onClick={submit} disabled={!text.trim()} title="Send">
          <Icon name="send" />
        </button>
      )}
    </div>
  )
}
