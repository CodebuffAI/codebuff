import { memo, useState } from 'react'

import { toolArg, toolLabel } from '../lib/formatTool'
import type { Message as Msg } from '../lib/types'

function ToolActivity({ tools, streaming }: { tools: Msg['tools']; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  if (tools.length === 0) return null
  return (
    <div className="acts">
      <button className="acts-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`acts-caret ${open ? 'open' : ''}`}>▸</span>
        {streaming ? 'Working' : 'Worked'} · {tools.length} step{tools.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="acts-list">
          {tools.map((t) => (
            <div key={t.id} className="act">
              <span className="act-name">{toolLabel(t.toolName)}</span>
              <span className="act-arg">{toolArg(t.toolName, t.input)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// Memoized: done messages never change identity, so during streaming only the
// live (last) message re-renders instead of the whole transcript.
export const Message = memo(function Message({ msg }: { msg: Msg }) {
  if (msg.role === 'user') {
    return (
      <div className="msg user">
        <div className="bubble">{msg.text}</div>
      </div>
    )
  }
  return (
    <div className="msg assistant">
      <ToolActivity tools={msg.tools} streaming={!msg.done} />
      {msg.text && <div className="prose">{msg.text}</div>}
      {!msg.done && !msg.text && msg.tools.length === 0 && <div className="thinking">…</div>}
    </div>
  )
})
