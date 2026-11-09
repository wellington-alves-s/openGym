// How far the latest weight is from the goal (S.targetW), both in the profile's unit.
/**
 * { diff, toward }: diff is weight minus goal (positive while above it, negative when still to gain),
 * one decimal; toward says whether this weight is closer to the goal than `previous` was (null
 * without a previous weight). Null without a weight or a goal.
 */
export function goalGap(weight, target, previous = null) {
  const w = Number(weight), g = Number(target)
  if (!(w > 0) || !(g > 0)) return null
  const p = Number(previous)
  return {
    diff: Math.round((w - g) * 10) / 10,
    toward: previous != null && p > 0 ? Math.abs(w - g) < Math.abs(p - g) : null,
  }
}
