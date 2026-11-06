// A trainer's model in the routine editor (spec section 5): the layout around the model's routines
// and a routine. A model is one plan, so its session holds a program of one fixed phase `m`, open
// from the start; this registry is its own, apart from the students' drafts.
import { useParams } from 'react-router-dom'
import { t } from '../../lib/i18n.js'
import { getModel, saveModel } from '../../lib/trainer-api.js'
import { createDraftSessions } from '../../lib/draft-session.js'
import { DraftLayout } from './PrescriptionWorkspace.jsx'

const models = createDraftSessions({
  load: async mid => {
    const { model } = await getModel(mid)
    return { program: { start: null, phases: [{ id: 'm', name: model.name, weeks: 1, bundle: model.bundle }] }, rev: model._rev }
  },
  save: async (mid, program, rev) => ({ rev: (await saveModel(mid, { bundle: program.phases[0].bundle, _rev: rev })).model._rev }),
  backTo: mid => '/models/' + mid + '/plan',
  changedText: () => t('The model changed somewhere else'),
})

// Reload, or a model deleted: drops the session and what it did not send.
export const dropSession = models.dropSession
// Before a rename: sends what the editor still holds, so the rename takes the newest rev. Rejects
// while those edits cannot be saved.
export const whenSaved = models.whenSaved

export default function ModelWorkspace() {
  return <DraftLayout registry={models} id={useParams().mid} loadFailed={t('Could not load the model. Check your connection and try again.')} />
}
