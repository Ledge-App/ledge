import type { FeedItem } from '@/lib/transactions/resolveFeed'

/**
 * Where the transfer sheet returns when it closes, decided when it OPENS.
 *
 * The distinction matters because it is what makes "nothing open" unreachable. The flow used to
 * re-derive its destination at close time from `transferItem`, and bail out when that had already
 * been cleared:
 *
 *     const item = transferItem
 *     setTransferItem(null)
 *     if (!item) return          // detail, transfer and manual all falsy from here
 *
 * TransactionEditSheets derives its single `active` from exactly those three, so that early return
 * left the host with nothing to show and dismissed the whole edit flow mid-reimbursement. Capturing
 * the destination at open time removes the branch: by the time the sheet can be closed, the answer
 * is already stored.
 */
export type TransferReturn = { to: 'detail'; item: FeedItem } | { to: 'manual' }

/**
 * A manual row's flow came from the manual edit sheet, which still holds the unsaved form, so it has
 * to land back there — reopening the Plaid-shaped detail sheet for it was the old flow's detour.
 * Any other row returns to the detail sheet, carrying the row so it can reopen on the same item.
 *
 * `source` is checked as well as the id: an id collision between a Plaid row and the manual row
 * being edited must not route a Plaid row into the manual form.
 */
export function transferReturnFor(item: FeedItem, editingManualId: string | null): TransferReturn {
  const cameFromManualSheet = item.source === 'manual' && editingManualId === item.id
  return cameFromManualSheet ? { to: 'manual' } : { to: 'detail', item }
}

/** The three flags TransactionEditSheets reads to decide what the host shows. */
export interface EditorSheetSelection {
  detailItem: FeedItem | null
  transferItem: FeedItem | null
  manualOpen: boolean
}

export type ActiveSheet = 'detail' | 'transfer' | 'manual'

/**
 * Which content the edit host shows, or null for "closed".
 *
 * Transfer wins over detail, and detail over manual: during a handoff both flags are written in the
 * same batch, so this order decides only what a mid-write render would show. Reading it as a single
 * value is what keeps the host from ever showing two contents at once.
 */
export function activeSheetOf(selection: EditorSheetSelection): ActiveSheet | null {
  if (selection.transferItem != null) return 'transfer'
  if (selection.detailItem != null) return 'detail'
  if (selection.manualOpen) return 'manual'
  return null
}

/**
 * The selection the editor lands in when the transfer sheet closes, by confirm or by decline.
 *
 * Total by construction: every destination names a sheet, so activeSheetOf is never null for the
 * result. That pairing is the invariant the reimbursement flow depends on — the old code could
 * clear all three and dismiss the user's edit mid-flow.
 */
export function selectionAfterTransfer(destination: TransferReturn): EditorSheetSelection {
  return destination.to === 'manual'
    ? { detailItem: null, transferItem: null, manualOpen: true }
    : { detailItem: destination.item, transferItem: null, manualOpen: false }
}

/**
 * The selection when the transfer sheet opens from the detail sheet.
 *
 * Detail and transfer move in one step rather than two so no intermediate state exists where both
 * are set (or worse, neither). Returned alongside the destination the eventual close will use, since
 * both are decided here from the same facts.
 */
export function openTransferFrom(
  item: FeedItem,
  editingManualId: string | null,
): { selection: EditorSheetSelection; transferReturn: TransferReturn } {
  return {
    selection: { detailItem: null, transferItem: item, manualOpen: false },
    transferReturn: transferReturnFor(item, editingManualId),
  }
}

/** The same, entered from the manual edit sheet, which always resumes there. */
export function openTransferFromManual(
  item: FeedItem,
): { selection: EditorSheetSelection; transferReturn: TransferReturn } {
  return {
    selection: { detailItem: null, transferItem: item, manualOpen: false },
    transferReturn: { to: 'manual' },
  }
}
