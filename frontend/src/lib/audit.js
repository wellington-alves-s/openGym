// Rendering for the admin activity log (GET /api/admin/audit).
//
// The server stores reason codes, not sentences — `{ ev: 'auth.login.fail', msg: 'unknown-credential' }`
// rather than "someone tried a passkey we don't know". Turning those into sentences
// belongs here and not in Admin.jsx: it is the only part of the feature that can be wrong in a way
// a person sees, and as a plain module it is testable without mounting the dashboard.
//
// Each table entry is a function that calls t() when read, because the tables are built at import
// time, before the language is set; written as literal t() calls they are also found by
// scripts/check-source-strings.mjs.
import { dateLocale, t } from './i18n-core.js'

// The first segment of an event name is also the filter chip it belongs to.
export const auditCat = ev => String(ev || '').split('.')[0]

const LABELS = {
  'auth.login.ok': () => t('Signed in'),
  'auth.login.fail': () => t('Sign-in failed'),
  'auth.register.ok': () => t('Created a profile'),
  'auth.register.fail': () => t('Profile creation failed'),
  'auth.register.denied': () => t('Signup refused'),
  'auth.logout': () => t('Signed out'),
  'auth.logout.all': () => t('Signed out everywhere'),
  // Settings → "Delete my account": the profile removed itself and everything of theirs.
  'auth.account.delete': () => t('Deleted their own account'),
  // Device pairing (Settings → "Pair the mobile app"): the code is minted in a signed-in browser
  // tab and redeemed by the app, so "ok" is the phone coming online, not a sign-in.
  'auth.pair.create': () => t('Created a pairing code'),
  'auth.pair.ok': () => t('Paired a phone'),
  'auth.pair.fail': () => t('Pairing failed'),
  // Password sign-in (#118), where the instance offers it.
  'auth.password.ok': () => t('Signed in with a password'),
  'auth.password.fail': () => t('Password sign-in failed'),
  'auth.password.locked': () => t('Password sign-in paused after repeated failures'),
  'auth.password.set': () => t('Set a password'),
  'auth.password.change': () => t('Changed their password'),
  'auth.password.remove': () => t('Removed their password'),
  'auth.password.reset': () => t('Used a reset code'),
  // The e-mail a profile may sign in with instead of its name. `msg` is the proof it was set with
  // and the address masked to two characters ("password · a…@e…") — never the address itself.
  'auth.email.set': () => t('Added a sign-in e-mail'),
  'auth.email.change': () => t('Changed their sign-in e-mail'),
  'auth.email.remove': () => t('Removed their sign-in e-mail'),
  'auth.email.fail': () => t('Changing the sign-in e-mail failed'),
  // More than one passkey, and one-time codes for another device (#95). `msg` on an addition or a
  // code is the proof it was made with (passkey, password); on a removal or a redemption, the
  // passkey's name.
  'auth.passkey.add': () => t('Added a passkey'),
  'auth.passkey.fail': () => t('Adding a passkey failed'),
  'auth.passkey.remove': () => t('Removed a passkey'),
  'auth.link.create': () => t('Made a one-time code for another device'),
  'auth.link.ok': () => t('Added a device with a one-time code'),
  'auth.link.fail': () => t('Adding a device with a code failed'),
  // Recovery codes (#584): made by an admin or by the server's own command, used on a new device.
  'auth.recovery.ok': () => t('Got back in with a recovery code'),
  'admin.recovery.create': () => t('Made a recovery code'),
  'server.recovery.create': () => t('A recovery code was made on the server'),
  // The owner's proof (current password or a passkey) for one of the changes below was refused.
  'auth.proof.fail': () => t('Confirming a change failed'),
  // The password throttle paused an address; `msg` says for what (password, signup).
  'auth.throttled': () => t('Too many failed attempts from one address'),
  'admin.user.disable': () => t('Disabled an account'),
  'admin.user.enable': () => t('Re-enabled an account'),
  'admin.user.delete': () => t('Deleted an account'),
  'admin.password.reset': () => t('Issued a password reset code'),
  'admin.role.grant': () => t('Made someone an admin'),
  'admin.role.revoke': () => t('Removed someone as admin'),
  'admin.owner.transfer': () => t('Handed the owner role on'),
  'admin.invite.create': () => t('Created an invite code'),
  'admin.invite.revoke': () => t('Revoked an invite code'),
  'admin.audit.clear': () => t('Cleared the activity log'),
  // FIRST_USER_ADMIN=1: the first profile on a fresh instance is made admin as it signs up.
  'admin.first-user': () => t('Became admin as the first profile'),
  'admin.denied': () => t('Blocked from an admin action'),
  // Photos and videos of custom exercises: "Reset everything" clearing a profile's files, and the
  // upload or clean-up throttle pausing a profile (`msg` says which).
  'media.sweep': () => t('Cleared unused photos and videos'),
  'media.throttled': () => t('Too many photo or video requests')
}
// An unknown event is shown raw rather than dropped or rendered as "undefined": a dashboard
// that is one version behind the server should still say *something* truthful.
export const auditLabel = ev => LABELS[ev]?.() || String(ev || t('Unknown event'))

const REASONS = {
  'challenge-expired': () => t('the sign-in took too long and expired'),
  'unknown-credential': () => t('unknown passkey'),
  'verify-error': () => t('the passkey could not be verified'),
  'not-verified': () => t('the passkey was rejected'),
  'user-missing': () => t('the passkey points at a profile that no longer exists'),
  'account-disabled': () => t('the account is disabled'),
  'credential-exists': () => t('that passkey already belongs to a profile'),
  'invite-invalid': () => t('the invite code was used or revoked in the meantime'),
  'invite-rejected': () => t('wrong or already-used invite code'),
  'code-invalid': () => t('wrong or expired pairing code'),
  'user-unavailable': () => t('the profile behind the code is disabled or gone'),
  'bad-password': () => t('wrong password'),
  'bad-current': () => t('wrong current password'),
  'unknown-name': () => t('no profile with a password has that name'),
  'unknown-email': () => t('no profile with a password has that e-mail'),
  'email-taken': () => t('another profile already uses that e-mail'),
  'step-up-failed': () => t('the passkey confirming the change was rejected'),
  'reset-invalid': () => t('wrong or expired reset code'),
  'link-invalid': () => t('wrong, used or expired device code'),
  'passkey-limit': () => t('the profile already has as many passkeys as it can hold'),
  // An `admin.denied` for a recovery code: only the owner makes one for an admin (#584).
  'recovery': () => t('a recovery code for an admin, which only the owner can make'),
  // What an `auth.throttled` pause was for.
  'password': () => t('wrong passwords or reset codes'),
  'signup': () => t('wrong invite codes on password signup'),
  'link': () => t('wrong one-time device codes'),
  'email': () => t('e-mail addresses already in use'),
  // What a `media.throttled` pause was for.
  'upload': () => t('photo and video uploads'),
  'sweep': () => t('clearing unused photos and videos')
}
export const auditReason = msg => REASONS[msg]?.() || (msg ? String(msg) : '')

// What an `auth.proof.fail` was confirming (the server's `act`).
const ACTS = {
  'email': () => t('changing the sign-in e-mail'),
  'email-remove': () => t('removing the sign-in e-mail'),
  'password': () => t('setting or changing the password'),
  'password-remove': () => t('removing the password'),
  'passkey-add': () => t('adding a passkey'),
  'passkey-remove': () => t('removing a passkey'),
  'device-link': () => t('making a one-time code for another device'),
  'pair': () => t('making a code to pair the phone app'),
  'account-delete': () => t('deleting their account')
}
export const auditAct = act => ACTS[act]?.() || (act ? String(act) : '')

// → { title, sub }. `sub` is the house "a · b · c" metadata line used by every list row.
export function auditLine(e) {
  if (!e) return { title: '', sub: '' }
  const parts = []
  if (e.name) parts.push(e.name)
  else if (e.uid) parts.push(e.uid)
  else if (!e.ok) parts.push(t('unknown caller'))
  if (e.tname) parts.push('→ ' + e.tname)
  if (e.act) parts.push(auditAct(e.act))
  // The reason codes and the invite codes share the msg field; only failures read as a reason.
  if (e.msg) parts.push(e.ok ? e.msg : auditReason(e.msg))
  if (e.ip) parts.push(e.ip)
  return { title: auditLabel(e.ev), sub: parts.join(' · ') }
}

// The activity log is the one place in the app that needs a clock, and fmtDate() renders none —
// it is used by every other view and is not worth changing for this.
export function fmtWhen(ts, now = Date.now()) {
  if (!ts) return ''
  const d = new Date(ts)
  const time = d.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  const n = new Date(now)
  const sameDay = d.toDateString() === n.toDateString()
  if (sameDay) return t('today {0}', time)
  if (now - ts < 6 * 86400000 && ts <= now) return d.toLocaleDateString(dateLocale(), { weekday: 'short' }) + ' ' + time
  return d.toLocaleDateString(dateLocale(), { day: 'numeric', month: 'short' }) + ' ' + time
}
