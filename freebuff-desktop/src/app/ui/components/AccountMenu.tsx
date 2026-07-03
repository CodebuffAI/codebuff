import { useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import { Icon } from './Icon'

/**
 * Signed-in account control in the tab bar's top-right corner. The account is
 * global (unlike the folder/agent choices in each thread's header), so it
 * lives on the window-level row. Icon-only trigger; the popover carries the
 * email and Sign out. Renders nothing while signed out — the LoginGate takes
 * over the same tab-bar slot (see TabBar).
 */
export function AccountMenu() {
  // App-level auth slice, not the engine snapshot: on a fresh install with no
  // project open there is no snapshot, but a signed-in user still needs the
  // account menu (to see who they are / sign out) on the welcome screen.
  const authed = useStore((s) => s.authed)
  const user = useStore((s) => s.authUser)
  const pushToast = useStore((s) => s.pushToast)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  if (!authed) return null

  const signOut = async () => {
    setSigningOut(true)
    try {
      const res = await api.logout()
      if (!res.ok) throw new Error(res.error ?? 'Could not sign out')
      // No local state patch: the server's signOutLocally broadcasts the
      // app-level `auth` event (plus a state snapshot when a project is open)
      // before this response resolves — the store's one writer handles it.
      setOpen(false)
      pushToast('Signed out')
    } catch (err) {
      pushToast((err as Error).message, 'error')
    } finally {
      setSigningOut(false)
    }
  }

  return (
    <div className="account-menu">
      <button
        className={`head-btn icon-only account-trigger ${open ? 'on' : ''}`}
        onClick={() => setOpen((v) => !v)}
        title={user?.email ?? 'Freebuff account'}
        aria-label="Freebuff account"
        aria-expanded={open}
      >
        <Icon name="user" />
      </button>
      {open && (
        <>
          <button className="menu-scrim" aria-label="Close account menu" onClick={() => setOpen(false)} />
          <div className="header-menu account-popover">
            {user?.email && <div className="header-menu-note">{user.email}</div>}
            <button className="header-menu-item" onClick={signOut} disabled={signingOut}>
              <Icon name="x" /> {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
