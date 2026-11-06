// The trainer's side of a student's draft plan (spec section 5.1): the layout around the plan list and
// the routine editor. The draft program lives in a session per student (lib/draft-session.js): loaded
// once, saved by itself 800 ms after the last change, stopped by a 409 until Reload. The editor works
// on the session's store, which shows one phase of the program.
import { Outlet, useParams } from 'react-router-dom'
import { t } from '../../lib/i18n.js'
import { getRx, saveRxDraft } from '../../lib/trainer-api.js'
import { WorkspaceContext } from '../../lib/workspace.js'
import { DraftSessionContext, createDraftSessions } from '../../lib/draft-session.js'
import { Button } from '../../components/ui.jsx'

// shortcut: every phase goes back to the plan list, until the routes name the phase (stage 2b, Task 8).
const students = createDraftSessions({
  load: async sid => { const { rx } = await getRx(sid); return { program: rx.draft.program, rev: rx._rev } },
  save: async (sid, program, rev) => ({ rev: (await saveRxDraft(sid, program, rev)).rx._rev }),
  backTo: sid => '/students/' + sid + '/plan',
})

// Reload: drops the session and what it did not send; the page reads the plan again.
export const dropSession = students.dropSession
/* For the screens that publish or restore: saves what is still waiting and resolves with the newest
   revision a save returned (undefined if none here). Rejects while edits cannot be saved. */
export const whenSaved = students.whenSaved

export default function PrescriptionWorkspace() {
  const { sid } = useParams()
  const { session, status, failed, retry: load } = students.useSession(sid)

  if (!session) return failed ? <div className="narrow"><div className="card" role="alert" style={{ marginTop: 16 }}>
    <div className="small muted" style={{ marginBottom: 10 }}>{t('Could not load the plan. Check your connection and try again.')}</div>
    <Button size="sm" icon="reset" onClick={load}>{t('Try again')}</Button>
  </div></div> : null
  return <DraftSessionContext.Provider value={session}><WorkspaceContext.Provider value={session.store}>
    {status === 'conflict' && <div className="narrow"><div className="card" role="alert" style={{ marginTop: 8 }}>
      <div className="small" style={{ marginBottom: 10 }}>{t('The plan changed somewhere else')}</div>
      <Button size="sm" icon="reset" onClick={() => dropSession(sid)}>{t('Reload')}</Button>
    </div></div>}
    {/* Always there, empty when idle, so a screen reader hears each change. */}
    <div className="narrow small dim" role="status" style={{ textAlign: 'end', marginTop: 4 }}>
      {status === 'saving' ? t('Saving') : status === 'saved' ? t('Saved')
        : status === 'failed' ? <>{t('Could not save. Try again.')} <Button size="sm" onClick={() => session.save()}>{t('Try again')}</Button></> : null}
    </div>
    <Outlet />
  </WorkspaceContext.Provider></DraftSessionContext.Provider>
}
