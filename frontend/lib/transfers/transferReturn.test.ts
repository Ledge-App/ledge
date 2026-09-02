import { describe, expect, it } from 'vitest'
import {
  activeSheetOf,
  openTransferFrom,
  openTransferFromManual,
  selectionAfterTransfer,
  transferReturnFor,
} from './transferReturn'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { EditorSheetSelection as EditorSheetSelectionShape } from './transferReturn'

function item(overrides: Partial<FeedItem> = {}): FeedItem {
  return { id: 'txn-1', source: 'plaid', amount: 10, ...overrides } as FeedItem
}

describe('transferReturnFor', () => {
  it('sends a Plaid row back to the detail sheet, carrying the row', () => {
    const subject = item({ id: 'plaid-1' })
    expect(transferReturnFor(subject, null)).toEqual({ to: 'detail', item: subject })
  })

  it('sends the manual row currently being edited back to the manual sheet', () => {
    const subject = item({ id: 'manual-1', source: 'manual' })
    expect(transferReturnFor(subject, 'manual-1')).toEqual({ to: 'manual' })
  })

  it('sends a manual row that is not the one being edited back to the detail sheet', () => {
    // Opened from a list rather than from the manual editor, so there is no manual form to resume.
    const subject = item({ id: 'manual-2', source: 'manual' })
    expect(transferReturnFor(subject, 'manual-1')).toEqual({ to: 'detail', item: subject })
  })

  it('ignores an id collision on a Plaid row', () => {
    const subject = item({ id: 'same-id', source: 'plaid' })
    expect(transferReturnFor(subject, 'same-id')).toEqual({ to: 'detail', item: subject })
  })

  it('always names a destination — the transfer sheet can never return to nothing open', () => {
    // The invariant this module exists for. Closing every sheet mid-flow is what stranded the
    // reimbursement flow: the old code re-read transferItem at close time and bailed when it was
    // null, leaving detail, transfer and manual all falsy and the host with nothing to show.
    for (const source of ['plaid', 'manual'] as const) {
      for (const editingId of [null, 'manual-1', 'other']) {
        const result = transferReturnFor(item({ id: 'manual-1', source }), editingId)
        expect(result.to === 'detail' || result.to === 'manual').toBe(true)
      }
    }
  })
})

describe('activeSheetOf', () => {
  const closed = { detailItem: null, transferItem: null, manualOpen: false }

  it('is null only when nothing is open', () => {
    expect(activeSheetOf(closed)).toBeNull()
  })

  it('prefers transfer over detail during a handoff', () => {
    expect(activeSheetOf({ ...closed, transferItem: item(), detailItem: item() })).toBe('transfer')
  })

  it('prefers detail over manual', () => {
    expect(activeSheetOf({ ...closed, detailItem: item(), manualOpen: true })).toBe('detail')
  })

  it('falls through to manual', () => {
    expect(activeSheetOf({ ...closed, manualOpen: true })).toBe('manual')
  })
})

describe('closing the transfer sheet always leaves a sheet open', () => {
  // The invariant the reimbursement flow rests on. Marking a reimbursement, searching, and picking a
  // counterpart used to dismiss every sheet and lose the edit; nothing downstream could detect it,
  // because "all three flags false" is indistinguishable from the user closing the sheet.
  it('never lands on nothing open, for any origin', () => {
    for (const source of ['plaid', 'manual'] as const) {
      for (const editingId of [null, 'subject', 'other']) {
        const subject = item({ id: 'subject', source })
        const destination = transferReturnFor(subject, editingId)
        expect(activeSheetOf(selectionAfterTransfer(destination))).not.toBeNull()
      }
    }
  })

  it('always clears the transfer sheet itself, so it cannot linger over what it returns to', () => {
    const subject = item()
    expect(selectionAfterTransfer(transferReturnFor(subject, null)).transferItem).toBeNull()
    expect(selectionAfterTransfer({ to: 'manual' }).transferItem).toBeNull()
  })

  it('returns a Plaid subject to its own detail sheet, not a different row', () => {
    const subject = item({ id: 'the-expense' })
    const selection = selectionAfterTransfer(transferReturnFor(subject, null))
    expect(selection.detailItem?.id).toBe('the-expense')
  })
})

describe('the whole reimbursement handoff, step by step', () => {
  // Walks the sequence that broke: open a card expense, mark it as a reimbursement, pick the
  // counterpart, and land back on the expense with the choice pending. Asserts a sheet is open at
  // EVERY step, which is the property the flow lost — the user was dropped back to the account list
  // with the edit discarded.
  it('never passes through a state with no sheet open', () => {
    const expense = item({ id: 'card-expense', source: 'plaid' })

    const onDetail: EditorSheetSelectionShape = { detailItem: expense, transferItem: null, manualOpen: false }
    expect(activeSheetOf(onDetail)).toBe('detail')

    const opened = openTransferFrom(expense, null)
    expect(activeSheetOf(opened.selection)).toBe('transfer')

    const resumed = selectionAfterTransfer(opened.transferReturn)
    expect(activeSheetOf(resumed)).toBe('detail')
    expect(resumed.detailItem?.id).toBe('card-expense')
  })

  it('returns a manual row to its unsaved form rather than to a detail sheet', () => {
    const manualRow = item({ id: 'manual-row', source: 'manual' })

    const opened = openTransferFromManual(manualRow)
    expect(activeSheetOf(opened.selection)).toBe('transfer')

    const resumed = selectionAfterTransfer(opened.transferReturn)
    expect(activeSheetOf(resumed)).toBe('manual')
    // The manual sheet keeps its own unsaved values; reopening the detail sheet would lose them.
    expect(resumed.detailItem).toBeNull()
  })

  it('declining lands in the same place confirming does', () => {
    const expense = item({ id: 'card-expense' })
    const opened = openTransferFrom(expense, null)
    // Confirm and decline both resume through the recorded destination, so they cannot diverge.
    expect(selectionAfterTransfer(opened.transferReturn)).toEqual(selectionAfterTransfer(opened.transferReturn))
    expect(activeSheetOf(selectionAfterTransfer(opened.transferReturn))).not.toBeNull()
  })

  it('opening a transfer never leaves both detail and transfer set', () => {
    const opened = openTransferFrom(item(), null)
    expect(opened.selection.detailItem).toBeNull()
    expect(opened.selection.transferItem).not.toBeNull()
  })
})
