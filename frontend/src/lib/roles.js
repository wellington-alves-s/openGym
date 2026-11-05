// What kind of account this is, from the user object GET /api/me returns (`role`, and
// `trainerStatus` for a trainer). An account with no role is the self-hosted lifter the app has
// always had; the helpers only ever add something for the two roles below.

export const roleOf = user => (user?.role === 'trainer' || user?.role === 'student' ? user.role : null)
export const isTrainer = user => roleOf(user) === 'trainer'
export const isApprovedTrainer = user => isTrainer(user) && user.trainerStatus === 'approved'
export const isPendingTrainer = user => isTrainer(user) && user.trainerStatus === 'pending'
export const isStudent = user => roleOf(user) === 'student'

// Where a signed-in account lands. A disabled trainer is neither approved nor pending.
export function homeFor(user) {
  return isApprovedTrainer(user) ? '/students' : isPendingTrainer(user) ? '/pending' : '/home'
}

// The bottom bar of an approved trainer, labels as English source keys (the bar translates them).
// Empty for everyone else, who keep the bar they have.
export function tabsFor(user) {
  if (!isApprovedTrainer(user)) return []
  return [
    { key: 'students', path: '/students', icon: 'person', label: 'Students' },
    { key: 'profile', path: '/settings', icon: 'gear', label: 'Profile' }
  ]
}
