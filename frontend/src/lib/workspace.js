// The store the routine editor works on (stage 2a, spec section 5.2). With no provider it is the
// user's own useStore; a trainer editing a student's draft plan provides a workspace store built
// here, which holds that plan beside the trainer's own settings and never writes the trainer's state.
import { createContext, useContext } from 'react'
import { create } from 'zustand'
import { useStore } from '../store/useStore.js'

export const WorkspaceContext = createContext(null)

export const useWorkspaceStore = () => useContext(WorkspaceContext) || useStore

export function createWorkspaceStore(ownS, bundle, { backTo } = {}) {
  const S = { ...ownS, routines: structuredClone(bundle.routines), week: structuredClone(bundle.week), unit: bundle.unit, customEx: [] }
  return create((set, get) => ({
    S, prescription: true, backTo,
    update(fn) {
      const cur = get().S
      // dayPlan is the trainer's own: an empty one keeps deleteRoutine from touching it.
      const draft = { ...cur, routines: structuredClone(cur.routines), week: structuredClone(cur.week), dayPlan: {} }
      fn(draft)
      set({ S: { ...cur, routines: draft.routines, week: draft.week } })
    },
    autoBackupNow() {},
  }))
}

export const bundleOf = (S, base) => ({ ...base, unit: S.unit, week: S.week, routines: S.routines })
