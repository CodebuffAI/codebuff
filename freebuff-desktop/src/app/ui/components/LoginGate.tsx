/**
 * Sign-in affordance for the Freebuff (hosted) agent. The desktop runs the
 * hosted agent in free mode as a logged-in user, so when no token is persisted
 * we surface a "Sign in" pill in the tab bar's account slot (where the profile
 * icon lives once signed in) — plus a larger variant on the no-tabs welcome
 * screen. Clicking starts the device-code flow (server /api/auth/login/start),
 * opens the login URL in the system browser, and waits — the server broadcasts
 * a fresh state event once the browser side completes, which flips
 * `freebuff.authed` and unmounts this gate.
 *
 * The flow itself (phase, expiry timer, reload rehydrate) lives in the store
 * (StoreState.login): there is one attempt server-side, so every mounted
 * sign-in surface — this gate in either variant, a notice card's action —
 * renders the same shared state. The button stays clickable while waiting: if
 * the browser step goes sideways (tab closed, login page never loaded),
 * another click re-opens the pending attempt's login URL. A ✕ beside it
 * cancels outright.
 */

import { useStore } from '../store/store'
import { Icon } from './Icon'

export function LoginGate({ variant = 'bar' }: { variant?: 'bar' | 'welcome' }) {
  const phase = useStore((s) => s.login.phase)
  const startLogin = useStore((s) => s.startLogin)
  const cancelLogin = useStore((s) => s.cancelLogin)

  return (
    <div className="login-gate">
      <button
        // The welcome variant is the primary CTA on an otherwise empty screen,
        // so it borrows the folder button's larger `.btn.welcome-open`
        // treatment. The cancel ✕ stays compact in both variants.
        className={variant === 'welcome' ? 'btn welcome-open' : 'head-btn'}
        onClick={() => void startLogin()}
        disabled={phase === 'starting'}
        title={
          phase === 'waiting'
            ? 'Finish signing in from the browser tab we opened — or click to open it again'
            : 'Sign in to use the Freebuff hosted agent'
        }
      >
        <Icon name="dot" />{' '}
        {phase === 'waiting' ? 'Waiting for sign-in… (retry)' : 'Sign in to Freebuff'}
      </button>
      {phase === 'waiting' && (
        <button
          className="head-btn icon-only"
          onClick={() => void cancelLogin()}
          title="Cancel sign-in"
          aria-label="Cancel sign-in"
        >
          <Icon name="x" />
        </button>
      )}
    </div>
  )
}
