import { useState } from 'react'

import { api } from '../lib/api'
import { useStore } from '../store/store'
import { Icon } from './Icon'

/**
 * Signed-in account control in the tab bar's top-right corner. The account is
 * global (unlike the folder/agent choices in each thread's header), so it
 * lives on the window-level row. Icon-only trigger; the popover carries the
 * email and Sign out. Renders nothing while signed out — the per-thread
 * LoginGate owns that state.
 */
export function AccountMenu() {
  const freebuff = useStore((s) => s.freebuff)
  const pushToast = useStore((s) => s.pushToast)
  const [open, setOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  if (!freebuff?.authed) return null

  const signOut = async () => {
    setSigningOut(true)
    try {
      const res = await api.logout()
      if (!res.ok) throw new Error(res.error ?? 'Could not sign out')
      const fb = useStore.getState().freebuff
      if (fb) useStore.setState({ freebuff: { ...fb, authed: false, user: null } })
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
        title={freebuff.user?.email ?? 'Freebuff account'}
        aria-label="Freebuff account"
        aria-expanded={open}
      >
        <Icon name="user" />
      </button>
      {open && (
        <>
          <button className="menu-scrim" aria-label="Close account menu" onClick={() => setOpen(false)} />
          <div className="header-menu account-popover">
            {freebuff.user?.email && <div className="header-menu-note">{freebuff.user.email}</div>}
            <button className="header-menu-item" onClick={signOut} disabled={signingOut}>
              <Icon name="x" /> {signingOut ? 'Signing out...' : 'Sign out'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
