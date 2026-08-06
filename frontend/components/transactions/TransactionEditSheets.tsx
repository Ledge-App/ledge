import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ManualTransactionSheet } from '@/components/transactions/ManualTransactionSheet'
import { ReimbursementSheet } from '@/components/reimbursements/ReimbursementSheet'
import type { TransactionEditor } from '@/hooks/useTransactionEditor'

interface TransactionEditSheetsProps {
  editor: TransactionEditor
}

// Renders the three edit sheets driven by useTransactionEditor. Mount it inside whatever container
// lists the transactions — when that container is itself a BottomSheet, keeping these as its
// children is what lets iOS stack the edit modal above it.
export function TransactionEditSheets({ editor }: TransactionEditSheetsProps) {
  return (
    <>
      <CategorySheet
        visible={editor.activeSheetItem != null}
        item={editor.activeSheetItem}
        categories={editor.categories}
        subcategories={editor.subcategories}
        onClose={editor.closeCategorySheet}
        onSave={editor.saveCategory}
        onOpenReimbursement={editor.openReimbursement}
      />
      <ReimbursementSheet
        visible={editor.reimbursementItem != null}
        expenseItem={editor.reimbursementItem}
        candidateIncomeItems={editor.candidateIncomeItems}
        onClose={editor.closeReimbursementSheet}
        onSave={editor.saveReimbursement}
      />
      <ManualTransactionSheet
        visible={editor.manualSheetOpen}
        transaction={editor.editingManual ?? undefined}
        categories={editor.categories}
        subcategories={editor.subcategories}
        isSaving={editor.isSavingManual}
        onClose={editor.closeManualSheet}
        onSave={editor.saveManual}
        onDelete={editor.editingManual ? editor.deleteManual : undefined}
      />
    </>
  )
}
