import { useCallback, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { useAccounts } from './useAccounts'
import { useCategories } from './useCategories'
import { useSubcategories } from './useSubcategories'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { useTransfers } from './useTransfers'
import { useManualTransactions } from './useManualTransactions'
import { buildTransferInputs } from '@/lib/transfers/buildTransferInputs'
import { transferCandidates } from '@/lib/transfers/candidates'
import type { PendingTransfer } from '@/lib/transfers/buildTransferInputs'
import type { FeedItem, FeedLink } from '@/lib/transactions/resolveFeed'
import type { Account, Category, ManualTransaction, Subcategory, TransferKind } from '@/types/domain'

// The detail sheet and the transfer sheet are both bottom sheets. Reopening one the instant the
// other closes fights the dismiss animation, so the handoff waits for it to finish.
const SHEET_HANDOFF_MS = 350
// Marking a manual transaction as a transfer saves first, so its sheet has further to travel.
const MANUAL_HANDOFF_MS = 400

export interface ManualInput {
  amount: string
  type: 'expense' | 'income'
  categoryId: string | null
  subcategoryId: string | null
  date: string
  note: string | null
}

export interface TransactionEditor {
  accounts: Account[]
  categories: Category[]
  subcategories: Subcategory[]
  activeSheetItem: FeedItem | null
  manualSheetOpen: boolean
  editingManual: ManualTransaction | null
  isSavingManual: boolean
  /**
   * True for the whole of the detail sheet's save — the override, the optional vendor rule and one
   * transfer create per counterpart — and for unmarking, which deletes one link at a time. Tracking
   * the sequence rather than any single mutation is the point: between two awaits every individual
   * mutation reads idle, which is exactly when the sheet looked frozen.
   */
  isSavingDetail: boolean
  saveError: string | null
  dismissSaveError: () => void
  /** Opens the detail sheet for Plaid items, the manual edit sheet for manual ones. */
  openTransaction: (item: FeedItem) => void
  openNewManual: () => void
  closeDetailSheet: () => void
  closeManualSheet: () => void
  saveCategory: (input: { categoryId: string | null; subcategoryId: string | null; applyToVendor: boolean; note: string | null }) => Promise<void>
  saveManual: (input: ManualInput) => Promise<void>
  deleteManual: () => void
  /** Removes a single link from the open transaction, leaving its other links in place. */
  unlink: (link: FeedLink) => Promise<void>

  // Transfer flow. The detail sheet's "Mark as Transfer"/"Mark as Reimbursement" toggles hand
  // off to the transfer sheet, which hands a pending choice back to be saved with the category.
  transferItem: FeedItem | null
  transferCandidateItems: FeedItem[]
  transferForcedKind: TransferKind | undefined
  /** The pending choice, with counterpart ids resolved to items for the detail sheet's summary. */
  pendingTransfer: { kind: TransferKind; counterpartItems: FeedItem[] } | null
  openTransfer: (forcedKind?: TransferKind) => void
  confirmTransfer: (input: { kind: TransferKind; counterpartIds: string[] }) => void
  declineTransfer: () => void
  clearPendingTransfer: () => void
  unmarkTransfer: () => Promise<void>
  /** Hands the manual edit (unsaved) to the transfer sheet the moment a mark toggle flips —
   *  the same immediate flow the Plaid detail sheet has. The link is written on save. */
  openManualTransfer: (input: ManualInput, forcedKind?: TransferKind) => void
  saveManualAndUnmarkTransfer: (input: ManualInput) => Promise<void>
  /** True when the manual transaction being edited is already a leg of a transfer. */
  editingManualIsTransfer: boolean
  /** True when the manual transaction being edited is already part of a reimbursement. */
  editingManualIsReimbursed: boolean
}

// Owns every piece of state and every mutation behind the three transaction edit sheets, so any
// screen that lists transactions — the Transactions tab, the account detail sheet — gets the same
// editing behaviour by pairing this with <TransactionEditSheets />.
export function useTransactionEditor(feed: FeedItem[]): TransactionEditor {
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [editingManual, setEditingManual] = useState<ManualTransaction | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [isSavingDetail, setIsSavingDetail] = useState(false)
  const [isSavingManual, setIsSavingManual] = useState(false)
  const [transferItem, setTransferItem] = useState<FeedItem | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const [transferForcedKind, setTransferForcedKind] = useState<TransferKind | undefined>(undefined)

  const accounts = useAccounts()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const transfers = useTransfers()
  const manualTransactions = useManualTransactions()

  // The sheet holds the item it was opened with, but unlinking rewrites that item's links a moment
  // later. Re-resolving against the current feed keeps the open sheet showing the truth.
  const liveActiveSheetItem = useMemo(
    () => (activeSheetItem ? feed.find((i) => i.id === activeSheetItem.id) ?? activeSheetItem : null),
    [activeSheetItem, feed],
  )

  const openTransaction = useCallback((item: FeedItem) => {
    if (item.source === 'manual') {
      setEditingManual({
        id: item.id,
        amount: Math.abs(item.amount).toFixed(2),
        type: item.amount < 0 ? 'income' : 'expense',
        categoryId: item.categoryId,
        subcategoryId: item.subcategoryId,
        date: item.date,
        note: item.note,
      })
      setManualSheetOpen(true)
    } else {
      setActiveSheetItem(item)
    }
  }, [])

  const openNewManual = useCallback(() => {
    setEditingManual(null)
    setManualSheetOpen(true)
  }, [])

  const closeManualSheet = useCallback(() => {
    setManualSheetOpen(false)
    setEditingManual(null)
    // Abandoning the edit abandons any counterpart picked for it — a pending link left behind
    // would silently attach to the next transaction whose sheet opens.
    setPendingTransfer(null)
  }, [])

  const saveCategory = useCallback(
    async (input: { categoryId: string | null; subcategoryId: string | null; applyToVendor: boolean; note: string | null }) => {
      if (!activeSheetItem) return
      setIsSavingDetail(true)
      try {
        // One override row carries both edits, so a note is written whenever it changed even
        // if no category is picked — and a category-only save must not erase a saved note.
        const noteChanged = (input.note ?? null) !== (activeSheetItem.note ?? null)
        if (input.categoryId || noteChanged) {
          await overrides.upsert({
            plaidTransactionId: activeSheetItem.id,
            categoryId: input.categoryId,
            subcategoryId: input.subcategoryId,
            note: input.note,
          })
          if (input.categoryId && input.applyToVendor) {
            await vendorMappings.upsert({ vendorName: activeSheetItem.merchantName, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
          }
        }
        if (pendingTransfer) {
          for (const transferInput of buildTransferInputs(activeSheetItem, pendingTransfer, feed)) {
            await transfers.create(transferInput)
          }
          setPendingTransfer(null)
        }
        setActiveSheetItem(null)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this change. Try again.')
      } finally {
        setIsSavingDetail(false)
      }
    },
    [activeSheetItem, feed, overrides, pendingTransfer, transfers, vendorMappings],
  )

  // The transfer sheet needs the saved shape of the edit, but the feed hasn't refetched yet, so
  // project the input onto the existing item.
  const editedManualAsFeedItem = useCallback(
    (input: ManualInput): FeedItem | null => {
      if (!editingManual) return null
      const existing = feed.find((item) => item.id === editingManual.id)
      if (!existing) return null
      // The form's amount is unsigned; the feed convention is positive = expense, negative =
      // income (resolveFeed applies the same mapping). Handing the sheet an unsigned amount
      // made every manual income look like an expense, so its transfer/reimbursement
      // candidate lists were sign-inverted and the real counterpart never appeared.
      const signedAmount = input.type === 'expense' ? Number(input.amount) : -Number(input.amount)
      return { ...existing, amount: signedAmount, date: input.date }
    },
    [editingManual, feed],
  )

  // The save itself, without the saving flag: the two entry points below each raise the flag once
  // around their own whole sequence, so wrapping it here too would clear it early on the path that
  // still has links to unmark.
  const saveManualSequence = useCallback(
    async (input: ManualInput) => {
      try {
        if (editingManual) {
          await manualTransactions.update({ id: editingManual.id, ...input })
        } else {
          await manualTransactions.create(input)
        }
        // Same contract as saveCategory: the counterpart picked in the transfer sheet is only
        // written when the edit itself is saved, so abandoning the edit abandons the link.
        if (pendingTransfer && editingManual) {
          const standIn = editedManualAsFeedItem(input)
          if (standIn) {
            for (const transferInput of buildTransferInputs(standIn, pendingTransfer, feed)) {
              await transfers.create(transferInput)
            }
          }
          setPendingTransfer(null)
        }
        setManualSheetOpen(false)
        setEditingManual(null)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this transaction. Try again.')
      }
    },
    [editingManual, manualTransactions, pendingTransfer, editedManualAsFeedItem, feed, transfers],
  )

  const saveManual = useCallback(
    async (input: ManualInput) => {
      setIsSavingManual(true)
      try {
        await saveManualSequence(input)
      } finally {
        setIsSavingManual(false)
      }
    },
    [saveManualSequence],
  )

  const openTransfer = useCallback(
    (forcedKind?: TransferKind) => {
      if (!activeSheetItem) return
      const item = activeSheetItem
      setTransferForcedKind(forcedKind)
      setActiveSheetItem(null)
      setTimeout(() => setTransferItem(item), SHEET_HANDOFF_MS)
    },
    [activeSheetItem],
  )

  // A manual item's flow came from the manual edit sheet (which still holds editingManual), so
  // confirm/decline must land back there — reopening the Plaid-shaped detail sheet for a
  // manual row was the old flow's detour.
  const cameFromManualSheet = useCallback(
    (item: FeedItem | null) => item?.source === 'manual' && editingManual?.id === item?.id,
    [editingManual],
  )

  // Confirming doesn't write anything yet — it hands the choice back to the sheet it came
  // from, which saves the edit and the transfer together.
  const confirmTransfer = useCallback(
    ({ kind, counterpartIds }: { kind: TransferKind; counterpartIds: string[] }) => {
      const item = transferItem
      setPendingTransfer({ kind, counterpartIds })
      setTransferItem(null)
      if (!item) return
      const returnsToManual = cameFromManualSheet(item)
      setTimeout(() => (returnsToManual ? setManualSheetOpen(true) : setActiveSheetItem(item)), SHEET_HANDOFF_MS)
    },
    [transferItem, cameFromManualSheet],
  )

  const declineTransfer = useCallback(() => {
    const item = transferItem
    setTransferItem(null)
    if (!item) return
    const returnsToManual = cameFromManualSheet(item)
    setTimeout(() => (returnsToManual ? setManualSheetOpen(true) : setActiveSheetItem(item)), SHEET_HANDOFF_MS)
  }, [transferItem, cameFromManualSheet])

  // Removes one link. unmark rather than delete, so the dismissal it writes stops the next
  // detection pass re-creating the pair the user just took apart.
  const unlink = useCallback(
    async (link: FeedLink) => {
      try {
        await transfers.unmark({ id: link.recordId })
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not remove this link. Try again.')
      }
    },
    [transfers],
  )

  // Unmarking drops every link the item has. Driven off item.links rather than item.transferId:
  // a reimbursed expense can hold several links and is never stamped with a transferId at all, so
  // the old guard on transferId made unmarking one silently do nothing.
  const unmarkTransferItem = useCallback(
    async (item: FeedItem) => {
      for (const link of item.links) await unlink(link)
    },
    [unlink],
  )

  const unmarkTransfer = useCallback(async () => {
    if (!activeSheetItem) return
    setIsSavingDetail(true)
    try {
      await unmarkTransferItem(activeSheetItem)
    } finally {
      setIsSavingDetail(false)
    }
    setActiveSheetItem(null)
  }, [activeSheetItem, unmarkTransferItem])

  // The manual-edit counterpart of the detail sheet's toggles: hand the (unsaved) edit to the
  // transfer sheet the moment a toggle flips. The manual sheet closes but keeps editingManual —
  // that's how confirm/decline know to come back here rather than to the detail sheet.
  const openManualTransfer = useCallback(
    (input: ManualInput, forcedKind?: TransferKind) => {
      const item = editedManualAsFeedItem(input)
      if (!item) return
      // Set (or cleared) explicitly: a forced kind left over from an earlier reimbursement
      // flow would otherwise lock a plain transfer marking to the wrong kind.
      setTransferForcedKind(forcedKind)
      setManualSheetOpen(false)
      setTimeout(() => setTransferItem(item), MANUAL_HANDOFF_MS)
    },
    [editedManualAsFeedItem],
  )

  const saveManualAndUnmarkTransfer = useCallback(
    async (input: ManualInput) => {
      const item = editedManualAsFeedItem(input)
      setIsSavingManual(true)
      try {
        await saveManualSequence(input)
        if (item) await unmarkTransferItem(item)
      } finally {
        setIsSavingManual(false)
      }
    },
    [editedManualAsFeedItem, saveManualSequence, unmarkTransferItem],
  )

  const transferCandidateItems = useMemo(
    () => (transferItem ? transferCandidates(feed, transferItem) : []),
    [feed, transferItem],
  )

  const resolvedPendingTransfer = useMemo(() => {
    if (!pendingTransfer) return null
    const counterpartItems = pendingTransfer.counterpartIds
      .map((id) => feed.find((i) => i.id === id))
      .filter((i): i is FeedItem => i != null)
    return { kind: pendingTransfer.kind, counterpartItems }
  }, [pendingTransfer, feed])

  const deleteManual = useCallback(() => {
    if (!editingManual) return
    const id = editingManual.id
    const feedItem = feed.find((item) => item.id === id)
    const isReimbursed = feedItem?.reimbursedAmount != null || feedItem?.isReimbursementIncome === true
    const isTransferLeg = feedItem?.transferKind != null

    Alert.alert(
      isTransferLeg
        ? 'This transaction is part of a transfer. Deleting it also removes the transfer. Delete anyway?'
        : isReimbursed
          ? 'This transaction is part of a reimbursement. Delete anyway?'
          : 'Delete this transaction?',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await manualTransactions.delete({ id })
              setManualSheetOpen(false)
              setEditingManual(null)
            } catch (err) {
              setSaveError(err instanceof Error ? err.message : 'Could not delete this transaction. Try again.')
            }
          },
        },
      ],
    )
  }, [editingManual, feed, manualTransactions])

  return {
    accounts: accounts.data ?? [],
    categories: categories.data ?? [],
    subcategories: subcategories.data ?? [],
    activeSheetItem: liveActiveSheetItem,
    manualSheetOpen,
    editingManual,
    isSavingManual,
    isSavingDetail,
    saveError,
    dismissSaveError: useCallback(() => setSaveError(null), []),
    openTransaction,
    openNewManual,
    // Dismissing the detail sheet discards the transfer chosen alongside it — nothing was
    // written yet, and leaving it pending would attach it to the next item opened.
    closeDetailSheet: useCallback(() => {
      setActiveSheetItem(null)
      setPendingTransfer(null)
    }, []),
    closeManualSheet,
    saveCategory,
    saveManual,
    deleteManual,
    unlink,

    transferItem,
    transferCandidateItems,
    transferForcedKind,
    pendingTransfer: resolvedPendingTransfer,
    openTransfer,
    confirmTransfer,
    declineTransfer,
    clearPendingTransfer: useCallback(() => setPendingTransfer(null), []),
    unmarkTransfer,
    openManualTransfer,
    saveManualAndUnmarkTransfer,
    editingManualIsTransfer: editingManual
      ? feed.find((item) => item.id === editingManual.id)?.transferKind != null
      : false,
    editingManualIsReimbursed: (() => {
      if (!editingManual) return false
      const item = feed.find((candidate) => candidate.id === editingManual.id)
      // Either leg counts: a reimbursed expense carries reimbursedAmount, the payback income
      // carries isReimbursementIncome — neither is stamped with a transferKind.
      return item ? item.reimbursedAmount != null || item.isReimbursementIncome : false
    })(),
  }
}
