import { useCallback, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { useAccounts } from './useAccounts'
import { useCategories } from './useCategories'
import { useSubcategories } from './useSubcategories'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { useReimbursements } from './useReimbursements'
import { useTransfers } from './useTransfers'
import { useManualTransactions } from './useManualTransactions'
import { buildTransferInputs } from '@/lib/transfers/buildTransferInputs'
import type { PendingTransfer } from '@/lib/transfers/buildTransferInputs'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Account, Category, ManualTransaction, Subcategory, TransferKind } from '@/types/domain'

// The category sheet and the transfer sheet are both bottom sheets. Reopening one the instant the
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
  reimbursementItem: FeedItem | null
  manualSheetOpen: boolean
  editingManual: ManualTransaction | null
  candidateIncomeItems: FeedItem[]
  isSavingManual: boolean
  saveError: string | null
  dismissSaveError: () => void
  /** Opens the category sheet for Plaid items, the manual edit sheet for manual ones. */
  openTransaction: (item: FeedItem) => void
  openNewManual: () => void
  closeCategorySheet: () => void
  closeReimbursementSheet: () => void
  closeManualSheet: () => void
  saveCategory: (input: { categoryId: string | null; subcategoryId: string | null; applyToVendor: boolean }) => Promise<void>
  openReimbursement: (input: { categoryId: string; subcategoryId: string | null }) => Promise<void>
  saveReimbursement: (linkedIncomeIds: string[]) => Promise<void>
  saveManual: (input: ManualInput) => Promise<void>
  deleteManual: () => void

  // Transfer flow. The category sheet's "Mark as Transfer"/"Mark as Reimbursement" toggles hand
  // off to the transfer sheet, which hands a pending choice back to be saved with the category.
  transferItem: FeedItem | null
  transferCandidateItems: FeedItem[]
  transferForcedKind: TransferKind | undefined
  isSavingTransfer: boolean
  /** The pending choice, with counterpart ids resolved to items for the category sheet's summary. */
  pendingTransfer: { kind: TransferKind; counterpartItems: FeedItem[] } | null
  openTransfer: (forcedKind?: TransferKind) => void
  confirmTransfer: (input: { kind: TransferKind; counterpartIds: string[] }) => void
  declineTransfer: () => void
  clearPendingTransfer: () => void
  unmarkTransfer: () => Promise<void>
  saveManualAndMarkTransfer: (input: ManualInput) => Promise<void>
  saveManualAndUnmarkTransfer: (input: ManualInput) => Promise<void>
  /** True when the manual transaction being edited is already a leg of a transfer. */
  editingManualIsTransfer: boolean
}

// Owns every piece of state and every mutation behind the three transaction edit sheets, so any
// screen that lists transactions — the Transactions tab, the account detail sheet — gets the same
// editing behaviour by pairing this with <TransactionEditSheets />.
export function useTransactionEditor(feed: FeedItem[]): TransactionEditor {
  const [activeSheetItem, setActiveSheetItem] = useState<FeedItem | null>(null)
  const [reimbursementItem, setReimbursementItem] = useState<FeedItem | null>(null)
  const [manualSheetOpen, setManualSheetOpen] = useState(false)
  const [editingManual, setEditingManual] = useState<ManualTransaction | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [transferItem, setTransferItem] = useState<FeedItem | null>(null)
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null)
  const [transferForcedKind, setTransferForcedKind] = useState<TransferKind | undefined>(undefined)

  const accounts = useAccounts()
  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const reimbursements = useReimbursements()
  const transfers = useTransfers()
  const manualTransactions = useManualTransactions()

  const candidateIncomeItems = useMemo(
    () => feed.filter((item) => item.amount < 0 && item.id !== reimbursementItem?.id && !item.isReimbursementIncome),
    [feed, reimbursementItem?.id],
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
  }, [])

  const saveCategory = useCallback(
    async (input: { categoryId: string | null; subcategoryId: string | null; applyToVendor: boolean }) => {
      if (!activeSheetItem) return
      try {
        if (input.categoryId) {
          await overrides.upsert({ plaidTransactionId: activeSheetItem.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
          if (input.applyToVendor) {
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
      }
    },
    [activeSheetItem, feed, overrides, pendingTransfer, transfers, vendorMappings],
  )

  const openReimbursement = useCallback(
    async (input: { categoryId: string; subcategoryId: string | null }) => {
      if (!activeSheetItem) return
      const item = activeSheetItem
      try {
        await overrides.upsert({ plaidTransactionId: item.id, categoryId: input.categoryId, subcategoryId: input.subcategoryId })
        setReimbursementItem(item)
        setActiveSheetItem(null)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this change. Try again.')
      }
    },
    [activeSheetItem, overrides],
  )

  const saveReimbursement = useCallback(
    async (linkedIncomeIds: string[]) => {
      if (!reimbursementItem) return
      try {
        for (const incomeId of linkedIncomeIds) {
          const incomeItem = feed.find((i) => i.id === incomeId)
          if (!incomeItem) continue
          await reimbursements.create({
            expensePlaidTransactionId: reimbursementItem.source === 'plaid' ? reimbursementItem.id : null,
            expenseManualTransactionId: reimbursementItem.source === 'manual' ? reimbursementItem.id : null,
            incomePlaidTransactionId: incomeItem.source === 'plaid' ? incomeItem.id : null,
            incomeManualTransactionId: incomeItem.source === 'manual' ? incomeItem.id : null,
            amount: Math.abs(incomeItem.amount).toFixed(2),
            note: null,
          })
        }
        setReimbursementItem(null)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this reimbursement. Try again.')
      }
    },
    [feed, reimbursementItem, reimbursements],
  )

  const saveManual = useCallback(
    async (input: ManualInput) => {
      try {
        if (editingManual) {
          await manualTransactions.update({ id: editingManual.id, ...input })
        } else {
          await manualTransactions.create(input)
        }
        setManualSheetOpen(false)
        setEditingManual(null)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this transaction. Try again.')
      }
    },
    [editingManual, manualTransactions],
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

  // Confirming doesn't write anything yet — it hands the choice back to the category sheet, which
  // saves the category and the transfer together.
  const confirmTransfer = useCallback(
    ({ kind, counterpartIds }: { kind: TransferKind; counterpartIds: string[] }) => {
      const item = transferItem
      setPendingTransfer({ kind, counterpartIds })
      setTransferItem(null)
      if (item) setTimeout(() => setActiveSheetItem(item), SHEET_HANDOFF_MS)
    },
    [transferItem],
  )

  const declineTransfer = useCallback(() => {
    const item = transferItem
    setTransferItem(null)
    if (item) setTimeout(() => setActiveSheetItem(item), SHEET_HANDOFF_MS)
  }, [transferItem])

  const unmarkTransferItem = useCallback(
    async (item: FeedItem) => {
      if (!item.transferId) return
      try {
        await transfers.delete({ id: item.transferId })
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not remove this transfer. Try again.')
      }
    },
    [transfers],
  )

  const unmarkTransfer = useCallback(async () => {
    if (!activeSheetItem) return
    await unmarkTransferItem(activeSheetItem)
    setActiveSheetItem(null)
  }, [activeSheetItem, unmarkTransferItem])

  // The transfer sheet needs the saved shape of the edit, but the feed hasn't refetched yet, so
  // project the input onto the existing item.
  const editedManualAsFeedItem = useCallback(
    (input: ManualInput): FeedItem | null => {
      if (!editingManual) return null
      const existing = feed.find((item) => item.id === editingManual.id)
      if (!existing) return null
      return { ...existing, amount: Number(input.amount), date: input.date }
    },
    [editingManual, feed],
  )

  const saveManualAndMarkTransfer = useCallback(
    async (input: ManualInput) => {
      const item = editedManualAsFeedItem(input)
      await saveManual(input)
      if (item) setTimeout(() => setTransferItem(item), MANUAL_HANDOFF_MS)
    },
    [editedManualAsFeedItem, saveManual],
  )

  const saveManualAndUnmarkTransfer = useCallback(
    async (input: ManualInput) => {
      const item = editedManualAsFeedItem(input)
      await saveManual(input)
      if (item) await unmarkTransferItem(item)
    },
    [editedManualAsFeedItem, saveManual, unmarkTransferItem],
  )

  // Only the opposite sign can be the other leg, and an item already in a transfer can't join a
  // second one.
  const transferCandidateItems = useMemo(() => {
    if (!transferItem) return []
    const wantExpense = transferItem.amount < 0
    return feed.filter((item) => (wantExpense ? item.amount > 0 : item.amount < 0) && item.transferKind === null)
  }, [feed, transferItem])

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
    activeSheetItem,
    reimbursementItem,
    manualSheetOpen,
    editingManual,
    candidateIncomeItems,
    isSavingManual: manualTransactions.isLoading,
    saveError,
    dismissSaveError: useCallback(() => setSaveError(null), []),
    openTransaction,
    openNewManual,
    // Dismissing the category sheet discards the transfer chosen alongside it — nothing was
    // written yet, and leaving it pending would attach it to the next item opened.
    closeCategorySheet: useCallback(() => {
      setActiveSheetItem(null)
      setPendingTransfer(null)
    }, []),
    closeReimbursementSheet: useCallback(() => setReimbursementItem(null), []),
    closeManualSheet,
    saveCategory,
    openReimbursement,
    saveReimbursement,
    saveManual,
    deleteManual,

    transferItem,
    transferCandidateItems,
    transferForcedKind,
    isSavingTransfer: transfers.isSaving,
    pendingTransfer: resolvedPendingTransfer,
    openTransfer,
    confirmTransfer,
    declineTransfer,
    clearPendingTransfer: useCallback(() => setPendingTransfer(null), []),
    unmarkTransfer,
    saveManualAndMarkTransfer,
    saveManualAndUnmarkTransfer,
    editingManualIsTransfer: editingManual
      ? feed.find((item) => item.id === editingManual.id)?.transferKind != null
      : false,
  }
}
