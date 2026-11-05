import { useState } from 'react'
import { t } from '../lib/i18n.js'
import MuscleExplorer from '../components/MuscleExplorer.jsx'
import { exerciseDetailSheet, addToRoutineSheet } from '../sheets.jsx'
import { Button } from '../components/ui.jsx'
import Library from './Library.jsx'

// The Exercises tab opens on the muscle explorer; the button in the header swaps to the flat
// searchable list (Library) and back. The choice is per visit: leaving the tab starts on muscles again.
export default function LibraryHome() {
  const [list, setList] = useState(false)
  if (list) return <Library onMuscles={() => setList(false)} />
  return <>
    <div className="hdr lib-hdr"><div><h1>{t('Exercises')}</h1></div>
      <Button size="sm" variant="tinted" icon="list" onClick={() => setList(true)}>{t('List')}</Button>
      <div className="sub lib-count">{t('Choose a muscle to see exercises that train it.')}</div>
    </div>
    <MuscleExplorer labeled onDetail={exerciseDetailSheet} onPlan={addToRoutineSheet} />
  </>
}
