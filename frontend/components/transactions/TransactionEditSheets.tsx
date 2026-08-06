import { CategorySheet } from '@/components/transactions/CategorySheet'
import { ManualTransactionSheet } from '@/components/transactions/ManualTransactionSheet'
import type { TransactionEditor } from '@/hooks/useTransactionEditor'

interface TransactionEditSheetsProps {
  editor: TransactionEditor
}

export function TransactionEditSheets({ editor }: TransactionEditSheetsProps) {
  return (
    <>
      <CategorySheet
        visible={editor.activeSheetItem != null}
        item={editor.activeSheetItem}
        categories={editor.categories}
        subcategories={editor.subcategories}
        pendingTransfer={null}
        onClose={editor.closeCategorySheet}
        onSave={editor.saveCategory}
        onOpenTransfer={() => {}}
        onClearPendingTransfer={() => {}}
        onUnmarkTransfer={() => {}}
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
