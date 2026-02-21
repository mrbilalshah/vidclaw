export function deriveState(tasks, stateRef) {
  const inProgress = tasks.filter(t => t.status === 'in-progress')
  const done = tasks.filter(t => t.status === 'done')
  const now = Date.now()

  const doneIds = new Set(done.map(t => t.id || t._id))
  const inProgressIds = new Set(inProgress.map(t => t.id || t._id))
  const prevDoneIds = stateRef.current.seenDoneIds
  const prevInProgressIds = stateRef.current.seenInProgressIds || new Set()
  const hasNewDone = [...doneIds].some(id => !prevDoneIds.has(id))
  const hasNewInProgress = [...inProgressIds].some(id => !prevInProgressIds.has(id))

  // Track new in-progress tasks — guarantee minimum working time
  if (hasNewInProgress || inProgress.length > 0) {
    const minWork = hasNewInProgress ? 10000 : 0
    stateRef.current.workingUntil = Math.max(stateRef.current.workingUntil || 0, now + minWork)
  }

  // Track new done tasks — queue celebration after working finishes
  if (hasNewDone) {
    stateRef.current.pendingCelebration = true
  }

  stateRef.current.seenDoneIds = doneIds
  stateRef.current.seenInProgressIds = inProgressIds

  // State priority: working (with minimum duration) → celebrating → idle
  if (now < (stateRef.current.workingUntil || 0) || inProgress.length > 0) {
    return 'working'
  }

  // Start celebration after working ends
  if (stateRef.current.pendingCelebration) {
    stateRef.current.pendingCelebration = false
    stateRef.current.celebrateUntil = now + 5000
  }

  if (now < stateRef.current.celebrateUntil) return 'celebrating'
  return 'idle'
}
