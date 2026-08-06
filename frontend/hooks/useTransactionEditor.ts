import { useCallback, useMemo, useState } from 'react'
import { Alert } from 'react-native'
import { useCategories } from './useCategories'
import { useSubcategories } from './useSubcategories'
import { useTransactionOverrides } from './useTransactionOverrides'
import { useVendorMappings } from './useVendorMappings'
import { useReimbursements } from './useReimbursements'
import { useManualTransactions } from './useManualTransactions'
import type { FeedItem } from '@/lib/transactions/resolveFeed'
import type { Category, ManualTransaction, Subcategory } from '@/types/domain'

export interface ManualInput {
  amount: string
  type: 'expense' | 'income'
  categoryId: string | null
  subcategoryId: string | null
  date: string
  note: string | null
}

export interface TransactionEditor {
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

  const categories = useCategories()
  const subcategories = useSubcategories()
  const overrides = useTransactionOverrides()
  const vendorMappings = useVendorMappings()
  const reimbursements = useReimbursements()
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
        setActiveSheetItem(null)
      } catch (err) {
        setSaveError(err instanceof Error ? err.message : 'Could not save this change. Try again.')
      }
    },
    [activeSheetItem, overrides, vendorMappings],
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

  const deleteManual = useCallback(() => {
    if (!editingManual) return
    const id = editingManual.id
    const feedItem = feed.find((item) => item.id === id)
    const isReimbursed = feedItem?.reimbursedAmount != null || feedItem?.isReimbursementIncome === true

    Alert.alert(
      isReimbursed ? 'This transaction is part of a reimbursement. Delete anyway?' : 'Delete this transaction?',
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
    closeCategorySheet: useCallback(() => setActiveSheetItem(null), []),
    closeReimbursementSheet: useCallback(() => setReimbursementItem(null), []),
    closeManualSheet,
    saveCategory,
    openReimbursement,
    saveReimbursement,
    saveManual,
    deleteManual,
  }
}
