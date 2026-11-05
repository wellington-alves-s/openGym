import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { webauthnOK, passkeyLogin, passkeyError, bio } from '../lib/api.js'
import { t } from '../lib/i18n.js'
import { DEMO, REPO } from '../lib/demo.js'
import { guestAllowed } from '../lib/guest.js'
import { useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Button } from '../components/ui.jsx'
import { askAddDeviceData } from '../sheets.jsx'
import { passwordOn, openPasswordSignIn } from '../components/PasswordAuth.jsx'
import RegisterProfile from '../components/RegisterProfile.jsx'
import Entry from './Entry.jsx'
import TrainerSignup from './TrainerSignup.jsx'
import { openDeviceLinkRedeem } from '../components/Passkeys.jsx'
import { openLostAccess } from '../components/LostAccess.jsx'

export default function Login() {
  const { setUser, adoptProfile, setGuest } = useStore()
  const config = useStore(s => s.config)
  const canGuest = guestAllowed(config)
  const pwOn = passwordOn(config)
  // Trainer mode: who is signing in, 'student' or 'trainer', asked first (Entry).
  const [kind, setKind] = useState(null)
  const [signup, setSignup] = useState(false)
  const trainerMode = !!config?.trainer_mode
  const register = () => useUI.getState().openSheet(close => <RegisterProfile close={close} />)
  // Where the screen offers a new profile. A student's account is made from their trainer's link.
  const create = !trainerMode ? <Button icon="plusCircle" onClick={register}>{t('Create new profile')}</Button>
    : kind === 'trainer' ? <Button icon="plusCircle" onClick={() => setSignup(true)}>{t('Create trainer account')}</Button>
    : <div className="card small muted" style={{ textAlign: 'start' }}>{t('Only your personal trainer can create accounts. Ask your trainer for an invite link.')}</div>
  const signIn = async () => {
    try { const u = await passkeyLogin(); setUser(u, { adopt: true }); await adoptProfile(askAddDeviceData); useUI.getState().toast(t('Welcome back, {0}', u.name)) }
    catch (e) { if (e.name !== 'NotAllowedError' && e.name !== 'AbortError') useUI.getState().toast(passkeyError(e, t('Sign-in failed'))) }
  }
  const head = <>
    <div style={{ fontSize: 54, display: 'flex', justifyContent: 'center', color: 'var(--acc)' }}><Icon name="dumbbell" /></div>
    <h1 style={{ fontSize: 34, fontWeight: 700, letterSpacing: '-.028em', margin: '10px 0 4px' }}>openGym</h1>
  </>
  const wrap = { display: 'flex', flexDirection: 'column', justifyContent: 'center', minHeight: '78vh', textAlign: 'center' }

  // Demo build: no backend to sign in against — the only way in is the local guest profile.
  if (DEMO) return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 30 }}>{t('Live demo. Everything stays in this browser.')}</div>
      <Button variant="primary" icon="play" onClick={() => setGuest(true)}>{t('Start the demo')}</Button>
      <div className="card small muted" style={{ textAlign: 'start', marginTop: 16 }}>
        {t('This demo runs entirely in your browser on example data. Nothing is sent anywhere. Passkey sign-in and sync across your devices come with the openGym server, which you get by self-hosting it.')}
      </div>
      <div className="dim small" style={{ marginTop: 22, lineHeight: 1.6 }}>
        <a href={REPO} target="_blank" rel="noopener">{t('Self-host it in a minute →')}</a>
      </div>
    </div>
  )

  if (trainerMode && !kind) return <div className="narrow" style={wrap}>{head}<Entry onPick={setKind} /></div>
  if (trainerMode && signup) return <div className="narrow" style={{ textAlign: 'start', paddingTop: 24 }}><TrainerSignup onBack={() => setSignup(false)} /></div>

  return (
    <div className="narrow" style={wrap}>
      {head}
      <div className="muted" style={{ marginBottom: 34 }}>{t('Your workouts. Your weights. Your profile.')}</div>
      {webauthnOK() ? <>
        <Button variant="primary" icon="fingerprint" onClick={signIn}>{t('Sign in with passkey')}</Button>
        <div style={{ height: 10 }} />
        {pwOn && <><Button icon="key" onClick={() => openPasswordSignIn()}>{t('Sign in with password')}</Button><div style={{ height: 10 }} /></>}
        {create}
        {/* Already signed in on another device: a code from there gives this one a passkey of
            its own (#95), instead of a new, empty profile. */}
        <div style={{ height: 10 }} />
        <Button variant="ghost" className="dim" icon="qr" onClick={openDeviceLinkRedeem}>{t('Use a code from your other device')}</Button>
        {/* No device signs you in any more (#584): what to try, and where a recovery code goes. */}
        <Button variant="ghost" className="dim" onClick={openLostAccess}>{t('Lost access?')}</Button>
        {canGuest && <div style={{ height: 4 }} />}
      </> : pwOn ? <>
        {/* Plain http on a LAN address, or a browser without passkey support: the password is
            the way in, and the only way to create a profile from here. */}
        <div className="card small muted" style={{ textAlign: 'start', marginBottom: 14 }}>{t("This browser doesn't support passkeys. Sign in with your name and password instead.")}</div>
        <Button variant="primary" icon="key" onClick={() => openPasswordSignIn()}>{t('Sign in with password')}</Button>
        <div style={{ height: 10 }} />
        {create}
        <Button variant="ghost" className="dim" onClick={openLostAccess}>{t('Lost access?')}</Button>
        {canGuest && <div style={{ height: 10 }} />}
      </> : <div className="card small muted" style={{ textAlign: 'start' }}>{canGuest
        ? t("This browser doesn't do passkeys, but you can still use openGym locally on this device.")
        // Without passkeys and without the guest entrance there is no way in from this browser,
        // so say that plainly instead of offering a local profile that cannot be created.
        : t("This browser doesn't support passkeys, and this instance requires an account. Try a browser or device with passkey support.")}</div>}
      {canGuest && <Button variant="ghost" className="dim" onClick={() => setGuest(true)}>{t('Continue without account')}</Button>}
      {trainerMode && <Button variant="ghost" className="dim" onClick={() => setKind(null)}>{t('Back')}</Button>}
      <div className="dim small" style={{ marginTop: 26, lineHeight: 1.5 }}>{pwOn ? t('Passkeys use {0}. A password works too, where passkeys do not.', bio()) : t('Passkeys use {0}. No passwords to remember.', bio())}<br />{t('Each profile keeps its own plan, workouts & body weight.')}</div>
    </div>
  )
}
