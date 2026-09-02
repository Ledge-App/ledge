import type { ReactNode } from 'react'

/**
 * The layers a single sheet host renders, kept in a module-level store rather than React state.
 *
 * Why not state: the host must sit above the screens so its Modal covers them, which makes it an
 * ancestor of every sheet. If registering a layer set state on the host, a sheet re-render would
 * re-render the entire app beneath it. Read through useSyncExternalStore instead, so a registration
 * re-renders only the host.
 *
 * Only one host exists at a time (see SheetHost), so a module-level store is the host's store.
 */
export interface SheetLayer {
  id: string
  /** Assigned on first registration, so layers stack in the order they opened. */
  order: number
  node: ReactNode
}

const layers = new Map<string, SheetLayer>()
const listeners = new Set<() => void>()
let nextOrder = 0

/**
 * Cached because useSyncExternalStore compares snapshots by identity: returning a fresh array from
 * getSnapshot makes React re-render on every check, forever. Recomputed only on mutation.
 */
let snapshot: SheetLayer[] = []

function publish(): void {
  snapshot = [...layers.values()].sort((a, b) => a.order - b.order)
  for (const listener of listeners) listener()
}

/** Registers or replaces a layer's content. An existing layer keeps its original order. */
export function setSheetLayer(id: string, node: ReactNode): void {
  const existing = layers.get(id)
  layers.set(id, { id, order: existing?.order ?? nextOrder++, node })
  publish()
}

export function removeSheetLayer(id: string): void {
  // Guarded so an unmount for a layer that never registered cannot wake every subscriber.
  if (!layers.delete(id)) return
  publish()
}

export function subscribeSheetLayers(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

export function getSheetLayers(): SheetLayer[] {
  return snapshot
}

/** Tests only: the store outlives any single component, so each case needs a clean slate. */
export function resetSheetRegistry(): void {
  layers.clear()
  listeners.clear()
  nextOrder = 0
  snapshot = []
}
