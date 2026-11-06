import { useEffect } from 'react'
import { useStore } from '../store/useStore.js'
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { studentRx, studentRxRev } from '../lib/trainer-api.js'
import { syncPrescription } from '../lib/prescription-sync.js'

// No interface: keeps a student's prescribed routines current when the app opens, comes back to
// the foreground or the network returns.
export default function PrescriptionSync() {
  useEffect(() => {
    // An answer that lands after a sign-out (or a switch of account) must not touch the copy the
    // device keeps now. This also keeps StrictMode's discarded first run from toasting twice.
    let alive = true, busy = false
    const uid = useStore.getState().user?.id
    const current = () => alive && useStore.getState().user?.id === uid
    const run = async () => {
      if (busy) return
      busy = true
      try {
        await syncPrescription({
          fetchRev: studentRxRev, fetchRx: studentRx,
          getS: () => useStore.getState().S,
          update: fn => { if (current()) useStore.getState().update(fn) },
          notify: () => { if (current()) useUI.getState().toast(t('Your trainer updated your training')) }
        })
      } catch (e) { console.warn('prescription sync', e) } finally { busy = false }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', run)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run)
    }
  }, [])
  return null
}
