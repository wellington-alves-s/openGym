// The published versions of a student's plan, newest first (StudentDetail's Versions). Restoring
// one copies it into the draft; nothing reaches the student until the trainer publishes again.
import { useUI } from '../store/useUI.js'
import { t } from '../lib/i18n.js'
import { fmtDate, isoOf } from '../lib/format.js'
import { restoreRx } from '../lib/trainer-api.js'
import { confirmSheet } from '../sheets.jsx'
import { Button } from './ui.jsx'
import { rxErrorText } from './PublishSheet.jsx'

export const dateOf = at => fmtDate(isoOf(new Date(at)), false, true)

export default function VersionsSheet({ sid, versions, latestRev, onDone, close }) {
  const restore = v => confirmSheet({
    title: t('Restore version {0}?', v),
    message: t('The draft becomes a copy of this version. Your student sees it only once you publish.'),
    confirmText: t('Restore to draft'),
    onConfirm: async () => {
      close()
      try {
        await restoreRx(sid, v, await latestRev())
        useUI.getState().toast(t('Version {0} is in the draft', v))
      } catch (e) { useUI.getState().toast(rxErrorText(e)) }
      onDone?.()
    },
  })
  const list = [...versions].sort((a, b) => b.v - a.v)
  return <div>
    <h3 style={{ marginBottom: 12 }}>{t('Versions')}</h3>
    {!list.length ? <div className="muted">{t('Nothing published yet')}</div>
      : <ul className="card" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label={t('Versions')}>
        {list.map((x, i) => <li key={x.v} style={{ padding: '12px 14px', borderTop: i ? '1px solid var(--separator, rgba(128,128,128,.2))' : 'none' }}>
          <div className="row between">
            <strong>{t('Version {0}', x.v)}</strong>
            <span className="small dim">{dateOf(x.at)}</span>
          </div>
          {x.note && <div className="small muted" style={{ marginTop: 4 }}>{x.note}</div>}
          <div className="row" style={{ marginTop: 8 }}>
            <Button size="sm" aria-label={t('Restore version {0} to draft', x.v)} onClick={() => restore(x.v)}>{t('Restore to draft')}</Button>
          </div>
        </li>)}
      </ul>}
  </div>
}
