import { createContext, useContext, useMemo } from 'react'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { TransactionEditSheets } from '@/components/transactions/TransactionEditSheets'
import { SheetHostProvider } from '@/components/ui/SheetHost'
import { useTransactionEditor } from '@/hooks/useTransactionEditor'
import type { TransactionEditor } from '@/hooks/useTransactionEditor'
import type { FeedItem } from '@/lib/transactions/resolveFeed'

/**
 * The two ways a screen touches the edit sheets, split so the expensive one can opt out of the
 * cheap one's re-renders.
 *
 * A list needs exactly two things — "open this row" and "start a new manual entry" — and both are
 * stable for the provider's whole life. Everything else (which sheet is open, what is pending,
 * whether a save is in flight) changes constantly and is wanted by nothing but the sheets.
 *
 * Handing a list the whole editor made those two facts inseparable: the list subscribed to all of
 * it, so opening a sheet re-rendered the month behind it. Two contexts is what lets the list
 * subscribe to the half that never changes.
 */
export interface TransactionEditorActions {
  openTransaction: (item: FeedItem) => void
  openNewManual: () => void
}

const ActionsContext = createContext<TransactionEditorActions | null>(null)
const EditorContext = createContext<TransactionEditor | null>(null)

/**
 * Owns the edit-sheet state and renders the sheets, so the screen above it does neither.
 *
 * The bail-out this exists for is React's: `children` arrives as an element created by the parent,
 * and when this component re-renders for its own state that element is unchanged by reference, so
 * React skips the entire subtree. The screen therefore re-renders only when the screen's own data
 * changes — never because a sheet opened.
 *
 * That only works while the screen reads nothing from EditorContext. It reads ActionsContext,
 * whose value is memoized on two callbacks that never change identity, so subscribing to it costs
 * nothing. Anything needing live editor state must be its own small component (see
 * TransactionEditorErrorBanner) rather than a value threaded through the screen.
 */
export function TransactionEditorProvider({ feed, children }: { feed: FeedItem[]; children: React.ReactNode }) {
  const editor = useTransactionEditor(feed)

  const actions = useMemo(
    () => ({ openTransaction: editor.openTransaction, openNewManual: editor.openNewManual }),
    [editor.openTransaction, editor.openNewManual],
  )

  return (
    <ActionsContext.Provider value={actions}>
      <EditorContext.Provider value={editor}>
        {/* The host is mounted HERE, below both contexts and above the edit sheets, because both
            halves of that sandwich are load-bearing and neither survives being split across files.
            Below the contexts: a layer renders at the host's tree position, so every context its
            content reads has to sit above the host. Above the edit sheets: BottomSheet reads
            useHasSheetHost() where it is *written*, so sheets written outside the host present
            their own Modal — and a second Modal beside the host's is the sibling arrangement that
            dismisses the whole stack mid-reimbursement. */}
        <SheetHostProvider>
          {children}
          <TransactionEditSheets editor={editor} />
        </SheetHostProvider>
      </EditorContext.Provider>
    </ActionsContext.Provider>
  )
}

export function useTransactionEditorActions(): TransactionEditorActions {
  const actions = useContext(ActionsContext)
  if (!actions) throw new Error('useTransactionEditorActions must be used inside a TransactionEditorProvider')
  return actions
}

/**
 * The save-error banner, as a component rather than a value the screen reads.
 *
 * saveError lives in the editor, and a screen that read it would subscribe to every other editor
 * change with it — which is exactly what the split above is avoiding. Placing this where the banner
 * belongs keeps the layout decision with the screen and the subscription down here, in something
 * that renders null almost always.
 */
export function TransactionEditorErrorBanner() {
  const editor = useContext(EditorContext)
  if (!editor?.saveError) return null
  return <ErrorBanner message={editor.saveError} onDismiss={editor.dismissSaveError} />
}
