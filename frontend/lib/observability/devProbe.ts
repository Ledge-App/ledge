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

/**
 * One sheet presentation (or dismissal), measured as elapsed milliseconds from a single t=0.
 *
 * Separate from probeMark, which times ONE function inside ONE component. This spans components:
 * the entrance animation is started by BottomSheet, but the Modal that finally puts the sheet on
 * screen is committed and presented by SheetHost, one registry publish and one host re-render
 * later. Only a shared clock can show the distance between those two moments — and that distance
 * is entrance animation the user never sees, because translateY's 350ms is already counting.
 *
 * A single module-level timeline rather than a map: sheets open one at a time, and a phase mark
 * carries no id of its own — the host does not know which sheet it is presenting for.
 */
let timeline: { id: string; startedAt: number } | null = null

/** Opens a timeline. Every probePhase after this reports against this t=0. */
export function probePhaseStart(id: string, label: string): void {
  if (!__DEV__) return
  timeline = { id, startedAt: Date.now() }
  console.log(`[probe] ${id} ${label} +0ms`)
}

export function probePhase(label: string): void {
  if (!__DEV__) return
  if (timeline == null) return
  console.log(`[probe] ${timeline.id} ${label} +${Date.now() - timeline.startedAt}ms`)
}

/**
 * JS-thread responsiveness over a window, sampled in 250ms buckets.
 *
 * Deliberately plain setInterval/setTimeout and nothing else. The Reanimated frame probe this
 * replaces never printed its report and never printed its own teardown line either, which means it
 * was failing in a way the instrumentation could not see — and an unexplained probe is worse than no
 * probe, because its silence reads as "no jank".
 *
 * A 16ms interval that fires 40ms late was blocked for 24ms. Buckets rather than one summary so the
 * SHAPE is visible: a stall profile that grows as more cells mount is a different bug from a flat one.
 */
export function probeStallSampler(label: string, durationMs: number): void {
  if (!__DEV__) return
  let previous = Date.now()
  let worstInBucket = 0
  let bucketStartedAt = previous
  const buckets: number[] = []

  const sampler = setInterval(() => {
    const now = Date.now()
    const stall = now - previous - 16
    previous = now
    if (stall > worstInBucket) worstInBucket = stall
    if (now - bucketStartedAt >= 250) {
      buckets.push(Math.round(worstInBucket))
      worstInBucket = 0
      bucketStartedAt = now
    }
  }, 16)

  setTimeout(() => {
    clearInterval(sampler)
    console.log(`[probe] ${label} — worst JS stall per 250ms: [${buckets.join(', ')}]`)
  }, durationMs)
}
