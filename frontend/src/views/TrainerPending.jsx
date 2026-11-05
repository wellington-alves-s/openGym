// A trainer the owner has not approved yet (route /pending, lib/roles.js homeFor): nothing else
// to do here but wait, or sign out. The screen asks the server again now and then, so the approval
// moves the trainer on without a sign-out.
import { useEffect } from 'react'
import { t } from '../lib/i18n.js'
import { api } from '../lib/api.js'
import { useStore } from '../store/useStore.js'
import { Button } from '../components/ui.jsx'
import { leaveServer } from '../components/ServerSync.jsx'

const RECHECK_MS = 30_000

export default function TrainerPending() {
  // Settings' sign-out: it checks the server has every change first. shortcut: no backup export
  // offered on the "not everything is on your server" sheet; a pending trainer has had nothing to log.
  const signOut = () => leaveServer('signout', { done: () => {} })
  // The same /api/me boot reads. A user that changed (approved, rejected, disabled) goes to the
  // store, and App's redirect does the rest; nothing changed, nothing written. An answer that
  // fails is ignored: the next tick or the next focus asks again.
  useEffect(() => {
    let live = true
    const recheck = async () => {
      try {
        const me = await api('/api/me')
        const st = useStore.getState()
        if (live && me?.user?.id && me.user.trainerStatus !== st.user?.trainerStatus) st.setUser(me.user)
      } catch (e) {
        // The session ended (revoked, account deleted): boot drops the user the same way, and the
        // sign-in screen takes over. Anything else (offline, a hiccup): ask again later.
        if (live && e?.status === 401) useStore.getState().setUser(null)
      }
    }
    const onVisible = () => { if (document.visibilityState !== 'hidden') recheck() }
    const timer = setInterval(recheck, RECHECK_MS)
    window.addEventListener('focus', recheck)
    document.addEventListener('visibilitychange', onVisible)
    return () => { live = false; clearInterval(timer); window.removeEventListener('focus', recheck); document.removeEventListener('visibilitychange', onVisible) }
  }, [])
  return <div className="narrow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }}>
    <h2 role="status" style={{ marginBottom: 24 }}>{t('Waiting for the owner to approve your account')}</h2>
    <Button icon="signOut" onClick={signOut}>{t('Sign out')}</Button>
  </div>
}
