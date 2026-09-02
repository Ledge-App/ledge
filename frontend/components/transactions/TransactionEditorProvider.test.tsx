import { describe, expect, it, vi } from 'vitest'
import { createElement, type ReactNode } from 'react'
import TestRenderer, { act } from 'react-test-renderer'

/**
 * The edit sheets must render INSIDE the sheet host.
 *
 * `BottomSheet` decides between registering a layer and presenting its own `<Modal>` by reading
 * `useHasSheetHost()` where it is written. The sheets used to be written beside the host rather
 * than inside it, which took the standalone path: with an account or category sheet already open
 * the app presented two sibling Modals —
 * the arrangement docs/superpowers/specs/2026-08-31-single-sheet-host-design.md rules out by test
 * on RN 0.86, and the one whose symptom is the reimbursement flow dismissing the sheets.
 *
 * No unit test can reach that native failure. What it can pin down is the tree position that
 * causes it, which is what this asserts.
 */

// react-native cannot be imported under vitest's node environment; SheetHost only needs Modal to
// exist as a component, and the host renders no layers in this test anyway.
vi.mock('react-native', () => ({
  Modal: ({ children }: { children?: ReactNode }) => children ?? null,
}))
vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { children?: ReactNode }) => children ?? null,
}))
vi.mock('@/components/ui/ErrorBanner', () => ({ ErrorBanner: () => null }))
// The host logs its layer stack through the dev probe, which reads __DEV__ — undefined outside Metro.
vi.mock('@/lib/observability/devProbe', () => ({ probeLog: () => {}, probePhase: () => {} }))
vi.mock('@/hooks/useTransactionEditor', () => ({ useTransactionEditor: () => ({}) }))

/** Stands in for the real sheets, reporting the one thing under test: does it see a host? */
let sawHost: boolean | null = null
vi.mock('@/components/transactions/TransactionEditSheets', async () => {
  const { useHasSheetHost } = await import('@/components/ui/SheetHost')
  return {
    TransactionEditSheets: () => {
      sawHost = useHasSheetHost()
      return null
    },
  }
})

const { TransactionEditorProvider } = await import('./TransactionEditorProvider')

describe('TransactionEditorProvider', () => {
  it('renders the edit sheets inside the host, so they register a layer instead of presenting their own Modal', () => {
    sawHost = null
    act(() => {
      TestRenderer.create(createElement(TransactionEditorProvider, { feed: [], children: null }))
    })

    expect(sawHost).toBe(true)
  })
})
