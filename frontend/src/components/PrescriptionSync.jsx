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
    let busy = false
    const run = async () => {
      if (busy) return
      busy = true
      try {
        await syncPrescription({
          fetchRev: studentRxRev, fetchRx: studentRx,
          getS: () => useStore.getState().S,
          update: fn => useStore.getState().update(fn),
          notify: () => useUI.getState().toast(t('Your trainer updated your training'))
        })
      } finally { busy = false }
    }
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    run()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', run)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', run)
    }
  }, [])
  return null
}
