/**
 * TEMPORARY DIAGNOSTIC — delete this file and its call sites once the sheet freeze is understood.
 *
 * Answers two questions in a single repro:
 *
 * 1. Is the JS thread alive during the freeze? The heartbeat keeps printing if it is. A frozen app
 *    with a live heartbeat is being starved of touches, not looping. A heartbeat that stops dead
 *    means JS is wedged, and the last `probeMark` line before the silence names what wedged it.
 * 2. How often does each feed derivation run, and how long does it take? A derivation firing
 *    hundreds of times is a loop; firing twice and taking seconds is a slow re-render.
 */
const HEARTBEAT_MS = 2000

let heartbeatStarted = false

/**
 * Registered by each mounted sheet so the heartbeat can report where it actually sits.
 *
 * The freeze leaves a Modal presented while the sheet appears closed, so the question is whether
 * translateY is stranded near SCREEN_HEIGHT — offscreen, invisible, but with a full-screen backdrop
 * still swallowing touches.
 */
const sheetState = new Map<string, () => string>()

export function registerProbeSheet(id: string, read: () => string): () => void {
  if (!__DEV__) return () => {}
  sheetState.set(id, read)
  return () => void sheetState.delete(id)
}

export function startDevHeartbeat(): void {
  if (!__DEV__ || heartbeatStarted) return
  heartbeatStarted = true
  let tick = 0
  setInterval(() => {
    tick += 1
    const sheets = [...sheetState.entries()].map(([id, read]) => `${id}{${read()}}`).join(' ')
    console.log(`[probe] heartbeat ${tick}${sheets ? ` presented: ${sheets}` : ''}`)
  }, HEARTBEAT_MS)
}

const counts = new Map<string, number>()

/**
 * Marks the START of a derivation and returns a function that closes it out.
 *
 * Deliberately not a wrapper taking a callback: doing that put the derivation body inside a closure,
 * where TypeScript could no longer see the narrowing from the guards above it.
 *
 * The start line always prints, so a derivation that never returns is visible as an unclosed mark —
 * which is exactly the signature of the hang being hunted.
 */
export function probeMark(label: string): () => void {
  if (!__DEV__) return () => {}
  const count = (counts.get(label) ?? 0) + 1
  counts.set(label, count)
  console.log(`[probe] ${label} #${count} start`)
  const startedAt = Date.now()
  return () => {
    const elapsed = Date.now() - startedAt
    console.log(`[probe] ${label} #${count} end ${elapsed}ms`)
  }
}

/** Callable from a Reanimated worklet via runOnJS. */
export function probeLog(message: string): void {
  if (!__DEV__) return
  console.log(`[probe] ${message}`)
}

/**
 * How many sheets are up, split by HOW they are up.
 *
 * The distinction is the whole point. On iOS a <Modal> is a UIKit view-controller presentation
 * whose dismissal is asynchronous, and presenting one while another is still dismissing can strand
 * an invisible modal window that swallows every touch — invisible to React, which is why the app
 * freezes with a live JS thread and nothing reporting as mounted. Two LAYERS inside the one host
 * Modal are the intended arrangement and are not that. Counting both together, as this did before
 * the host existed, cried wolf on every stacked sheet.
 *
 * So: `presented` is the number that must never exceed 1. `layers` is free to stack.
 */
let presentedModals = 0
let hostLayers = 0

export function probeSheetMounted(id: string, mounted: boolean, presentsModal: boolean): void {
  if (!__DEV__) return
  const delta = mounted ? 1 : -1
  if (presentsModal) presentedModals += delta
  else hostLayers += delta
  const warning = presentedModals > 1 ? '  <<< OVERLAPPING MODALS' : ''
  console.log(
    `[probe] sheet ${id} ${mounted ? 'MOUNT' : 'UNMOUNT'} as ${presentsModal ? 'MODAL' : 'layer'} — ` +
      `${presentedModals} presented, ${hostLayers} layers${warning}`,
  )
}

let nextSheetId = 0
export function nextProbeSheetId(): string {
  return `s${(nextSheetId += 1)}`
}
