// A trainer the owner has not approved yet (route /pending, lib/roles.js homeFor): nothing else
// to do here but wait, or sign out.
import { t } from '../lib/i18n.js'
import { Button } from '../components/ui.jsx'
import { leaveServer } from '../components/ServerSync.jsx'

export default function TrainerPending() {
  // Settings' sign-out: it checks the server has every change first. shortcut: no backup export
  // offered on the "not everything is on your server" sheet; a pending trainer has had nothing to log.
  const signOut = () => leaveServer('signout', { done: () => {} })
  return <div className="narrow" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }}>
    <h2 style={{ marginBottom: 24 }}>{t('Waiting for the owner to approve your account')}</h2>
    <Button icon="signOut" onClick={signOut}>{t('Sign out')}</Button>
  </div>
}
