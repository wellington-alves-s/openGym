import { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store/useStore.js'
import { BODYPARTS, allExercises, equipmentOf, searchExercises } from '../lib/exercises.js'
import { activeProfile, exAvailable } from '../lib/equipment.js'
import { bestWeightFor } from '../lib/history.js'
import { fmtNum, exCount } from '../lib/format.js'
import { MUSCLES, MUSCLE_NAME, musclesOf, inMuscleOrder } from '../lib/muscles.js'
import { t, exerciseNameFor, exerciseNameClass } from '../lib/i18n.js'
import BodyMap from './BodyMap.jsx'
import BodyMapLabeled from './BodyMapLabeled.jsx'
import FilterSheet from './FilterSheet.jsx'
import { useUI } from '../store/useUI.js'
import { Thumb } from './Media.jsx'
import Icon from './Icon.jsx'
import ExerciseViewToggle from './ExerciseViewToggle.jsx'
import { Button, Segmented } from './ui.jsx'
import { tappable } from '../lib/use-sheet-keyboard.js'
import { useAutoMore } from '../lib/use-auto-more.js'
import { favIds, isFav, sortFavouritesFirst } from '../lib/favourites.js'

const FAV = '☆'

// One explorer for the Library and every catalogue picker. Supplying `onPick` turns
// a result into a selection; without it the explorer behaves like the normal Library.
export default function MuscleExplorer({ onPick, onDetail, onPlan, pickIcon = 'plus', initial = null, labeled = false }) {
  const S = useStore(s => s.S)
  // The muscles picked on the map. Only the Exercises tab (`labeled`) takes several at once; the
  // other explorers keep one, tapping it again clears it.
  const [picked, setPicked] = useState(initial ? [initial] : [])
  const selected = picked[0] || null
  const [q, setQ] = useState('')
  const [bp, setBp] = useState('')
  const [eq, setEq] = useState([])   // equipment types; the chip strip sets one, the labelled sheet any number
  const [shown, setShown] = useState(40)
  const [sortBy, setSortBy] = useState('relevance')   // 'name' = A to Z by the name on screen; only the Exercises tab offers it
  const [showAll, setShowAll] = useState(false)   // ignore the active equipment profile for this session
  const moreRef = useAutoMore(() => setShown(s => s + 40))
  const resultsRef = useRef(null)
  // The labelled map is tall, so the exercises of a tapped muscle start below the fold: bring them up.
  useEffect(() => { if (labeled && picked.length) resultsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }) }, [labeled, picked.length])
  // The labelled (Exercises tab) flow always shows picture cards; the list/cards button is for the other explorers.
  const cards = labeled || S.exerciseView === 'cards'
  // Same rule as the Library and the picker: the active equipment profile narrows the catalogue
  // (and the per-muscle counts) unless the user asks for everything.
  const profile = activeProfile(S)
  const catalog = useMemo(() => {
    const all = allExercises(S)
    return (profile && !showAll) ? all.filter(e => exAvailable(S, e)) : all
  }, [S.customEx, S.equipFilterOn, S.activeEquipId, S.equipProfiles, showAll])
  const counts = useMemo(() => Object.fromEntries(MUSCLES.map(m => [m,
    catalog.filter(e => musclesOf(e)[m]).length
  ])), [catalog])
  const pick = muscle => {
    setPicked(cur => labeled ? (cur.includes(muscle) ? cur.filter(m => m !== muscle) : [...cur, muscle]) : (cur[0] === muscle ? [] : [muscle]))
    setEq([]); setShown(40)
  }
  // Several muscles: an exercise counts when it trains any of them.
  const targeted = picked.length ? catalog.filter(e => { const w = musclesOf(e); return picked.some(m => w[m]) }) : []
  // The picker's Favourites chip (#669), here for the chosen muscle: '☆' in place of a body part.
  const favOn = bp === FAV
  const favHere = targeted.filter(e => isFav(S, e.id)).length
  const base = searchExercises(targeted.filter(e => favOn ? isFav(S, e.id) : (!bp || e.bp === bp)), q)
  const eqOpts = equipmentOf(base)
  const eqOn = eq.filter(x => eqOpts.includes(x))
  // Favourites float to the top of whatever the filters left (issue #6), the rest keeps its order.
  const narrowedList = eqOn.length ? base.filter(e => eqOn.includes(e.eq)) : base
  const exercises = sortBy === 'name'
    ? [...narrowedList].sort((a, b) => exerciseNameFor(a).localeCompare(exerciseNameFor(b)))
    : sortFavouritesFirst(narrowedList, S)
  const choose = ex => onPick ? onPick(ex) : onDetail(ex)
  // The live count and the × of the Library's search (#338): the count while a search or a
  // filter narrows the muscle's list, the × while there is text.
  const narrowed = !!(q.trim() || bp || eqOn.length)
  const sheet = (title, options, values, onApply) =>
    useUI.getState().openSheet(close => <FilterSheet title={title} options={options} values={values} onApply={onApply} close={close} />)

  return <>
    {profile && <div className="small dim row" style={{ margin: '-4px 2px 10px', gap: 6, alignItems: 'center' }}>
      <Icon name="kettlebell" style={{ fontSize: 13 }} />
      {showAll ? t('Showing all equipment') : t('Showing what you have in "{0}"', profile.name)}
      <button className="chip nocap" style={{ marginInlineStart: 'auto', padding: '3px 10px', fontSize: 12 }} onClick={() => { setShowAll(v => !v); setEq([]); setShown(40) }}>
        {showAll ? t('Filter by "{0}"', profile.name) : t('Show all equipment')}
      </button>
    </div>}
    <div className="card">
      {labeled ? <BodyMapLabeled body={S.body} selected={picked} onMuscle={pick} /> : <>
        <BodyMap className="tappable" body={S.body} selected={selected} onMuscle={pick} />
        <div className="chips" style={{ marginTop: 10 }}>
          {MUSCLES.map(m => <button key={m} className={'chip' + (selected === m ? ' on' : '')}
            aria-pressed={selected === m} onClick={() => pick(m)}>
            {t(MUSCLE_NAME[m])} <span className="dim">{counts[m]}</span>
          </button>)}
        </div>
      </>}
    </div>

    {!picked.length && onPick && <div className="empty"><div className="ico"><Icon name="figureStrength" /></div>{t('Choose a muscle to see exercises that train it.')}</div>}

    {picked.length > 0 && <>
      <div className="row between" ref={resultsRef} style={{ margin: '2px 0 10px' }}>
        <h4 className="sec" style={{ margin: 0 }}>{t('Exercises for {0}', picked.map(m => t(MUSCLE_NAME[m])).join(', '))}</h4>
        <Button size="sm" variant="ghost" onClick={() => { setPicked([]); setEq([]); setShown(40) }}>{t('Clear selection')}</Button>
      </div>
      <div className="search-row" style={{ marginBottom: 10 }}><div className={'search' + (narrowed ? ' has-count' : '') + (q ? ' has-clear' : '')}><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
        <input className="input" placeholder={t('Search…')} value={q} onChange={e => { setQ(e.target.value); setShown(40) }} />
        {narrowed && <span className="search-count" role="status" aria-label={exCount(exercises.length)}>{fmtNum(exercises.length)}</span>}
        {q && <button className="clear" onClick={() => { setQ(''); setShown(40) }} aria-label={t('Clear')}><Icon name="xmark" /></button>}
      </div>{!labeled && <ExerciseViewToggle />}</div>
      {labeled && <div className="row" style={{ gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <Button size="sm" variant="tinted" icon="figureStrength" onClick={() => sheet(t('Muscle groups'), MUSCLES.map(m => ({ value: m, label: t(MUSCLE_NAME[m]) })), picked, v => { setPicked(inMuscleOrder(v)); setEq([]); setShown(40) })}>
          {t('Muscle groups')} ({picked.length})</Button>
        {(eqOpts.length > 1 || eqOn.length > 0) && <Button size="sm" variant="tinted" icon="kettlebell" onClick={() => sheet(t('Equipment'), eqOpts.map(x => ({ value: x, label: t(x) })), eqOn, v => { setEq(v); setShown(40) })}>
          {t('Equipment')}{eqOn.length > 0 && ` (${eqOn.length})`}</Button>}
      </div>}
      {labeled && <div style={{ marginBottom: 10 }}><Segmented value={sortBy} onChange={v => { setSortBy(v); setShown(40) }}
        options={[{ value: 'relevance', label: t('Relevance') }, { value: 'name', label: t('Alphabetical') }]} /></div>}
      {/* Changing body part keeps the equipment filter (issue #71, same rule as Library): the
          eqOn fallback above drops it only for this view if the new body part has nothing under
          it, without forgetting the choice. "All" clears it, since it spans every body part. */}
      <div className="chips" style={{ marginBottom: eqOpts.length > 1 ? 8 : 12 }}>
        {favIds(S).length > 0 && <button className={'chip' + (favOn ? ' on' : '')} onClick={() => { setBp(FAV); setEq([]); setShown(40) }}><Icon name="starFill" className="fav-star" />{t('Favourites')} ({favHere})</button>}
        <button className={'chip nocap' + (!bp ? ' on' : '')} onClick={() => { setBp(''); setEq([]); setShown(40) }}>{t('All')}</button>
        {BODYPARTS.map(b => <button key={b} className={'chip' + (bp === b ? ' on' : '')} onClick={() => { setBp(b); setShown(40) }}>{t(b)}</button>)}
      </div>
      {!labeled && eqOpts.length > 1 && <div className="chips" style={{ marginBottom: 12 }}>
        <button className={'chip nocap' + (!eqOn.length ? ' on' : '')} onClick={() => { setEq([]); setShown(40) }}>{t('Any equipment')}</button>
        {eqOpts.map(x => <button key={x} className={'chip' + (eqOn.includes(x) ? ' on' : '')} onClick={() => { setEq([x]); setShown(40) }}>{t(x)}</button>)}
      </div>}
      <div className={'list' + (cards ? ' ex-grid' : '')}>
        {exercises.slice(0, shown).map(e => {
          const best = bestWeightFor(S, e.id)
          const primary = picked.some(m => musclesOf(e)[m] === 1)
          return <div key={e.id} className="item" {...tappable(() => choose(e))}>
            <Thumb ex={e} />
            <div className="grow"><div className={`tt ${exerciseNameClass(e)}`}>{isFav(S, e.id) && <Icon name="starFill" className="fav-star" />}{exerciseNameFor(e)}</div><div className="ss">{t(primary ? 'Primary target' : 'Also trains')} · <span className="capitalize">{t(MUSCLE_NAME[e.tg] || e.tg || e.bp)} · {t(e.eq)}</span></div></div>
            {onPick ? <Icon name={pickIcon} className="chev" /> : <>
              {best > 0 && <span className="tag acc">{fmtNum(best)}</span>}
              <Button size="sm" variant="tinted" icon="plus" onClick={ev => { ev.stopPropagation(); onPlan(e) }}>{t('Plan')}</Button>
            </>}
          </div>
        })}
        {exercises.length === 0 && <div className="empty"><div className="ico"><Icon name="magnifier" /></div>{t('No match')}</div>}
      </div>
      {exercises.length > shown && <><div style={{ height: 10 }} /><Button ref={moreRef} onClick={() => setShown(s => s + 40)}>{t('Show more')}</Button></>}
    </>}
  </>
}
