import freebuffLogo from './freebuff-logo.svg'

/**
 * The empty-thread welcome card. The project and agent/model picks live in
 * the thread header, so this card is purely a "you haven't started yet"
 * marker — the wordmark plus the title. The composer below it is the actual
 * input surface (see ThreadView).
 */

export function ThreadSetup(_props: { threadId: string }) {
  return (
    <div className="welcome">
      <img className="welcome-logo" src={freebuffLogo} alt="" />
      <div className="welcome-title">New thread</div>
    </div>
  )
}
