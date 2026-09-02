import { createContext, Fragment, useContext, useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { Modal } from 'react-native'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { getSheetLayers, setHostPresented, subscribeSheetLayers } from '@/lib/ui/sheetRegistry'

/**
 * Whether a sheet host is mounted above this point in the tree.
 *
 * BottomSheet uses it to decide between registering a layer and presenting its own Modal. Sheets
 * outside the tabs — onboarding's Plaid form — have no host and keep the standalone path, which is
 * safe there because nothing stacks on top of them.
 */
const SheetHostContext = createContext(false)

export function useHasSheetHost(): boolean {
  return useContext(SheetHostContext)
}

/**
 * The one Modal the app presents, with sheets rendered inside it as layers.
 *
 * iOS mishandles both alternatives, each confirmed on this codebase: a Modal presented inside
 * another Modal's subtree leaves the touch layer unrecoverable (taps stop being delivered until the
 * app is relaunched), and two sibling Modals fight for the screen. Presenting exactly once — when
 * the first layer registers — and dismissing when the last leaves is the only arrangement that
 * avoids both, because no presentation ever overlaps another.
 *
 * Mounted below TransactionFeedProvider and TransactionEditorProvider so that layers, which render
 * here rather than where they were written, resolve the same contexts they would have resolved in
 * place. That constraint is why TransactionEditorProvider had to be hoisted out of the sheets.
 */
function SheetHostLayers() {
  const layers = useSyncExternalStore(subscribeSheetLayers, getSheetLayers)

  const isPresenting = layers.length > 0

  // Clears the presentation flag when the Modal goes away. onDismiss below would be the precise
  // signal, but it is iOS-only, so Android would otherwise leave the flag stuck true and let the
  // next sheet start its entrance before that Modal has presented — the exact bug this fixes.
  useEffect(() => {
    if (!isPresenting) setHostPresented(false)
  }, [isPresenting])

  if (layers.length === 0) return null

  return (
    <Modal
      transparent
      visible
      statusBarTranslucent
      // The moment the sheets have been waiting for: UIKit reports the presentation finished, so a
      // sheet's entrance animation will now actually be seen. Sheets read this through the registry
      // rather than context, so publishing it re-renders no one but the sheets themselves.
      onShow={() => setHostPresented(true)}
      onDismiss={() => setHostPresented(false)}
    >
      {/* Required inside the Modal: its content mounts in a detached native hierarchy that the
          root-level gesture handler never reaches, so the grabber's pan needs a root of its own. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
        {layers.map((layer) => (
          <Fragment key={layer.id}>{layer.node}</Fragment>
        ))}
      </GestureHandlerRootView>
    </Modal>
  )
}

export function SheetHostProvider({ children }: { children: ReactNode }) {
  return (
    <SheetHostContext.Provider value={true}>
      {children}
      <SheetHostLayers />
    </SheetHostContext.Provider>
  )
}
